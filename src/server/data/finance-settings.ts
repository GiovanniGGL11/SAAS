import { prisma } from '@/lib/db';
import type { PaymentMethod, TransactionType } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

export const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'PIX',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'BANK_TRANSFER',
  'OTHER',
];

export type PaymentFee = {
  paymentMethod: PaymentMethod;
  feePercent: number;
  settlementDays: number;
};

export async function getPaymentFees(companyId: string): Promise<PaymentFee[]> {
  const rows = await prisma.paymentMethodFee.findMany({ where: { companyId } });
  const byMethod = new Map(rows.map((r) => [r.paymentMethod, r]));
  return ALL_PAYMENT_METHODS.map((paymentMethod) => {
    const row = byMethod.get(paymentMethod);
    return {
      paymentMethod,
      feePercent: row ? Number(row.feePercent) : 0,
      settlementDays: row?.settlementDays ?? 0,
    };
  });
}

export async function savePaymentFees(companyId: string, fees: PaymentFee[]): Promise<void> {
  await prisma.$transaction(
    fees.map((fee) =>
      prisma.paymentMethodFee.upsert({
        where: { companyId_paymentMethod: { companyId, paymentMethod: fee.paymentMethod } },
        create: { companyId, ...fee },
        update: { feePercent: fee.feePercent, settlementDays: fee.settlementDays },
      }),
    ),
  );
}

/** Categorias que o próprio sistema usa nos lançamentos automáticos: não podem ser removidas. */
export const SYSTEM_CATEGORIES = [
  'Atendimento',
  'Gorjeta',
  'Produto',
  'Pacotes',
  'Assinaturas',
  'Vale-presente',
  'Sinal',
  'Comissões',
];

const DEFAULT_CATEGORIES: Record<TransactionType, string[]> = {
  INCOME: [
    'Atendimento',
    'Gorjeta',
    'Produto',
    'Pacotes',
    'Assinaturas',
    'Vale-presente',
    'Sinal',
    'Outras receitas',
  ],
  EXPENSE: [
    'Aluguel',
    'Energia',
    'Água',
    'Internet e telefone',
    'Produtos e insumos',
    'Salários',
    'Comissões',
    'Impostos',
    'Marketing',
    'Manutenção',
    'Sistemas',
    'Outras despesas',
  ],
};

export type FinanceCategories = Record<TransactionType, string[]>;

/** Categorias da empresa; na primeira vez, cria a lista padrão para ela editar. */
export async function listFinanceCategories(companyId: string): Promise<FinanceCategories> {
  let rows = await prisma.financeCategory.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
    select: { type: true, name: true },
  });
  // As categorias que o sistema usa sozinho sempre existem (empresas antigas não tinham as novas).
  const missingSystem = SYSTEM_CATEGORIES.filter(
    (name) => rows.length > 0 && !rows.some((r) => r.name === name),
  );
  if (missingSystem.length) {
    await prisma.financeCategory.createMany({
      data: missingSystem.map((name) => ({
        companyId,
        type: name === 'Comissões' ? ('EXPENSE' as const) : ('INCOME' as const),
        name,
      })),
      skipDuplicates: true,
    });
    rows = await prisma.financeCategory.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { type: true, name: true },
    });
  }
  if (rows.length === 0) {
    await prisma.financeCategory.createMany({
      data: (['INCOME', 'EXPENSE'] as const).flatMap((type) =>
        DEFAULT_CATEGORIES[type].map((name) => ({ companyId, type, name })),
      ),
      skipDuplicates: true,
    });
    rows = await prisma.financeCategory.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { type: true, name: true },
    });
  }
  const collator = new Intl.Collator('pt-BR');
  const pick = (type: TransactionType) =>
    rows
      .filter((r) => r.type === type)
      .map((r) => r.name)
      .sort(collator.compare);
  return { INCOME: pick('INCOME'), EXPENSE: pick('EXPENSE') };
}

export async function addFinanceCategory(companyId: string, type: TransactionType, name: string) {
  const clean = name.trim();
  if (!clean) throw new UserError('Informe o nome da categoria.');
  const exists = await prisma.financeCategory.findFirst({
    where: { companyId, type, name: { equals: clean, mode: 'insensitive' } },
    select: { id: true },
  });
  if (exists) throw new UserError('Essa categoria já existe.');
  await prisma.financeCategory.create({ data: { companyId, type, name: clean } });
}

/** Remove da lista; os lançamentos antigos continuam com o nome. */
export async function removeFinanceCategory(
  companyId: string,
  type: TransactionType,
  name: string,
) {
  if (SYSTEM_CATEGORIES.includes(name)) {
    throw new UserError(
      'Essa categoria é usada nos lançamentos automáticos e não pode ser removida.',
    );
  }
  await prisma.financeCategory.deleteMany({ where: { companyId, type, name } });
}
