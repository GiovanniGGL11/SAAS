import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  checkoutAppointment,
  createAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { createTransaction, getCashFlowSummary } from '@/server/data/finance';
import { savePaymentFees } from '@/server/data/finance-settings';
import {
  createRecurringExpense,
  ensureRecurringTransactions,
  setRecurringExpenseActive,
  updateRecurringExpense,
} from '@/server/data/recurring-expenses';
import {
  addCashMovement,
  closeCashSession,
  getCashRegister,
  openCashSession,
} from '@/server/data/cash-register';
import { exportMonthCsv, getIncomeStatement } from '@/server/data/income-statement';
import { currentMonthKey, shiftMonth } from '@/lib/month';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('financeiro: taxas, caixa, contas fixas e DRE', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;

  beforeEach(async () => {
    fixture = await createTestCompany('fin2');
    companyId = fixture.company.id;
  });

  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  const newAppointment = (startAt: string) =>
    createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date(startAt),
      createdByUserId: 'user_test',
    });

  it('divide o pagamento, desconta a taxa do cartão e prevê quando cai na conta', async () => {
    await savePaymentFees(companyId, [
      { paymentMethod: 'CREDIT_CARD', feePercent: 3.5, settlementDays: 30 },
      { paymentMethod: 'PIX', feePercent: 0, settlementDays: 0 },
    ]);
    const appointment = await newAppointment('2030-05-02T13:00:00Z'); // R$ 50
    await checkoutAppointment({
      companyId,
      id: appointment.id,
      paymentMethod: 'PIX',
      split: [{ paymentMethod: 'CREDIT_CARD', amount: 20 }],
      updatedByUserId: 'user_test',
    });

    const rows = await prisma.transaction.findMany({
      where: { appointmentId: appointment.id, category: 'Atendimento' },
      orderBy: { amount: 'desc' },
    });
    expect(rows.map((r) => [r.paymentMethod, Number(r.amount), Number(r.feeAmount)])).toEqual([
      ['PIX', 30, 0],
      ['CREDIT_CARD', 20, 0.7],
    ]);
    const days = (rows[1].settlesAt!.getTime() - rows[1].paidAt!.getTime()) / 86_400_000;
    expect(days).toBe(30);

    const now = new Date();
    const summary = await getCashFlowSummary(companyId, {
      startAt: new Date(now.getTime() - 86_400_000),
      endAt: new Date(now.getTime() + 86_400_000),
    });
    expect(summary).toMatchObject({ income: 50, fees: 0.7, balance: 49.3, toSettle: 19.3 });

    // Desfazer cancela as duas partes; cobrar de novo reaproveita uma e a outra fica cancelada.
    await updateAppointmentStatus({
      companyId,
      id: appointment.id,
      status: 'CONFIRMED',
      updatedByUserId: 'user_test',
    });
    await checkoutAppointment({
      companyId,
      id: appointment.id,
      paymentMethod: 'CASH',
      updatedByUserId: 'user_test',
    });
    const active = await prisma.transaction.findMany({
      where: { appointmentId: appointment.id, status: { not: 'CANCELED' } },
    });
    expect(active.map((r) => [r.paymentMethod, Number(r.amount)])).toEqual([['CASH', 50]]);
  });

  it('recusa partes que somam mais que o total', async () => {
    const appointment = await newAppointment('2030-05-03T13:00:00Z');
    await expect(
      checkoutAppointment({
        companyId,
        id: appointment.id,
        paymentMethod: 'PIX',
        split: [{ paymentMethod: 'CREDIT_CARD', amount: 60 }],
        updatedByUserId: 'user_test',
      }),
    ).rejects.toThrow(/passa do total/);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(after.status).not.toBe('DONE');
  });

  it('conta fixa: lança este mês e o próximo uma vez só, atualiza e pausa as pendentes', async () => {
    const expense = await createRecurringExpense(
      companyId,
      { description: 'Aluguel', category: 'Aluguel', amount: 1500, dayOfMonth: 31 },
      TZ,
      'user_test',
    );
    await ensureRecurringTransactions(companyId, TZ);
    await ensureRecurringTransactions(companyId, TZ);
    const list = () =>
      prisma.transaction.findMany({
        where: { recurringExpenseId: expense.id },
        orderBy: { recurringMonth: 'asc' },
      });
    let rows = await list();
    const thisMonth = currentMonthKey(TZ);
    expect(rows.map((r) => r.recurringMonth)).toEqual([thisMonth, shiftMonth(thisMonth, 1)]);
    expect(rows.every((r) => r.status === 'PENDING' && r.type === 'EXPENSE')).toBe(true);

    // Pago este mês; mudar o valor só mexe na pendente.
    await prisma.transaction.update({
      where: { id: rows[0].id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await updateRecurringExpense(
      companyId,
      expense.id,
      { description: 'Aluguel', category: 'Aluguel', amount: 1600, dayOfMonth: 5 },
      TZ,
    );
    rows = await list();
    expect(rows.map((r) => Number(r.amount))).toEqual([1500, 1600]);

    await setRecurringExpenseActive(companyId, expense.id, false, TZ, 'user_test');
    rows = await list();
    expect(rows.map((r) => r.status)).toEqual(['PAID', 'CANCELED']);
    await setRecurringExpenseActive(companyId, expense.id, true, TZ, 'user_test');
    rows = await list();
    expect(rows.map((r) => r.status)).toEqual(['PAID', 'PENDING']);
  });

  it('caixa: esperado = troco + dinheiro recebido − pago + suprimento − sangria', async () => {
    await openCashSession(companyId, 'user_test', 100);
    await expect(openCashSession(companyId, 'user_test', 50)).rejects.toThrow(/caixa aberto/);
    const paid = (type: 'INCOME' | 'EXPENSE', amount: number, method: 'CASH' | 'PIX') =>
      createTransaction(
        companyId,
        {
          type,
          status: 'PAID',
          description: 'x',
          amount,
          paymentMethod: method,
          paidAt: new Date(),
        },
        'user_test',
      );
    await paid('INCOME', 50, 'CASH');
    await paid('INCOME', 80, 'PIX');
    await paid('EXPENSE', 5, 'CASH');

    let { current } = await getCashRegister(companyId);
    await addCashMovement({
      companyId,
      sessionId: current!.id,
      kind: 'WITHDRAWAL',
      amount: 30,
      userId: 'user_test',
    });
    await addCashMovement({
      companyId,
      sessionId: current!.id,
      kind: 'DEPOSIT',
      amount: 10,
      userId: 'user_test',
    });
    ({ current } = await getCashRegister(companyId));
    expect(current!.expectedCash).toBe(125);
    expect(current!.byMethod.find((m) => m.paymentMethod === 'PIX')?.income).toBe(80);

    const closed = await closeCashSession({
      companyId,
      sessionId: current!.id,
      countedCash: 120,
      userId: 'user_test',
    });
    expect([closed.expectedCash, closed.countedCash]).toEqual([125, 120]);
    await expect(
      addCashMovement({
        companyId,
        sessionId: current!.id,
        kind: 'DEPOSIT',
        amount: 1,
        userId: 'user_test',
      }),
    ).rejects.toThrow(/já foi fechado/);
    const register = await getCashRegister(companyId);
    expect(register.current).toBeNull();
    expect(register.recent).toHaveLength(1);
  });

  it('DRE do mês e planilha para o contador', async () => {
    await savePaymentFees(companyId, [
      { paymentMethod: 'DEBIT_CARD', feePercent: 2, settlementDays: 1 },
    ]);
    const add = (
      type: 'INCOME' | 'EXPENSE',
      category: string,
      amount: number,
      paymentMethod: 'DEBIT_CARD' | 'CASH',
    ) =>
      createTransaction(
        companyId,
        {
          type,
          status: 'PAID',
          description: category,
          category,
          amount,
          paymentMethod,
          paidAt: new Date(),
        },
        'user_test',
      );
    await add('INCOME', 'Atendimento', 200, 'DEBIT_CARD');
    await add('INCOME', 'Produto', 50, 'CASH');
    await add('EXPENSE', 'Aluguel', 100, 'CASH');

    const month = currentMonthKey(TZ);
    const dre = await getIncomeStatement(companyId, TZ, month);
    expect(dre.grossIncome[0]).toBe(250);
    expect(dre.fees[0]).toBe(4);
    expect(dre.netIncome[0]).toBe(246);
    expect(dre.totalExpenses[0]).toBe(100);
    expect(dre.result[0]).toBe(146);
    expect(dre.margin[0]).toBe(58.4);
    expect(dre.income.map((l) => l.category)).toEqual(['Atendimento', 'Produto']);

    const csv = await exportMonthCsv(companyId, TZ, month);
    expect(csv.startsWith('﻿Data;Tipo;Descrição')).toBe(true);
    expect(csv).toContain(
      ';Entrada;Atendimento;Atendimento;Cartão de débito;Pago;200,00;4,00;196,00;',
    );
    expect(csv).toContain(';Saída;Aluguel;Aluguel;Dinheiro;Pago;-100,00;0,00;-100,00;');
  });
});
