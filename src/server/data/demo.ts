import type { AppointmentStatus, PaymentMethod } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz, type CalendarDate } from '@/lib/time';

/**
 * Empresa de demonstração: agenda, clientes, estoque e caixa fictícios para mostrar o sistema e
 * testar sem mexer em empresas reais. Tudo é gravado em lotes (createMany) — pelas funções da agenda
 * seriam milhares de idas ao banco. Os lançamentos seguem o formato que a comanda grava, para os
 * relatórios e o painel lerem igual.
 */

export const DEMO_CREATED_BY = 'demo-seed';
const DAYS_BACK = 45;
const DAYS_AHEAD = 10;
const OPEN = 9 * 60;
const CLOSE = 19 * 60;

/** Gerador pseudoaleatório com semente: a mesma demonstração sai sempre parecida. */
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFESSIONALS = [
  { name: 'Ana Lima', color: '#ff9500' },
  { name: 'Bruno Costa', color: '#34c759' },
  { name: 'Carla Souza', color: '#5856d6' },
];

const SERVICES = [
  {
    name: 'Limpeza de pele',
    durationMinutes: 60,
    price: 150,
    color: '#0a84ff',
    returnAfterDays: 30,
  },
  {
    name: 'Massagem relaxante',
    durationMinutes: 60,
    price: 120,
    color: '#34c759',
    returnAfterDays: 21,
  },
  {
    name: 'Design de sobrancelha',
    durationMinutes: 30,
    price: 50,
    color: '#ff9f0a',
    returnAfterDays: 21,
  },
  { name: 'Manicure', durationMinutes: 45, price: 45, color: '#ff2d55', returnAfterDays: 14 },
  {
    name: 'Drenagem linfática',
    durationMinutes: 60,
    price: 130,
    color: '#5ac8fa',
    returnAfterDays: 7,
  },
  { name: 'Corte', durationMinutes: 45, price: 70, color: '#af52de', returnAfterDays: 30 },
];

const FIRST = [
  'Mariana',
  'Juliana',
  'Fernanda',
  'Patrícia',
  'Camila',
  'Aline',
  'Beatriz',
  'Larissa',
  'Rafael',
  'Lucas',
  'Gabriel',
  'Thiago',
  'Renata',
  'Vanessa',
  'Paula',
  'Débora',
  'Eduardo',
  'Felipe',
  'Carolina',
  'Letícia',
];
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Almeida', 'Ferreira', 'Rocha'];

const PAYMENTS: PaymentMethod[] = ['PIX', 'PIX', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH'];

/** Preenche uma empresa recém-criada com dados de exemplo. Só para empresas de demonstração. */
export async function seedDemoCompany(companyId: string, timezone: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, isDemo: true },
    select: { id: true },
  });
  if (!company) throw new Error('Só empresas de demonstração recebem dados de exemplo.');

  const rand = random(20261015);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const today = getTodayInTz(timezone);
  const now = Date.now();

  const professionals = await prisma.professional.createManyAndReturn({
    data: PROFESSIONALS.map((p) => ({ ...p, companyId })),
    select: { id: true },
  });
  // Segunda a sábado, das 9h às 19h: o link público e a agenda já saem com expediente.
  await prisma.professionalAvailability.createMany({
    data: professionals.flatMap((p) =>
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        professionalId: p.id,
        weekday,
        startTime: '09:00',
        endTime: '19:00',
      })),
    ),
  });

  const services = await prisma.service.createManyAndReturn({
    data: SERVICES.map((s) => ({ ...s, companyId })),
    select: { id: true, name: true, durationMinutes: true, price: true },
  });

  const clientsData = Array.from({ length: 40 }, (_, i) => {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
    // Um aniversariante hoje, para o aviso do painel aparecer.
    const birth =
      i === 0
        ? new Date(Date.UTC(1990, today.month - 1, today.day))
        : new Date(Date.UTC(1975 + (i % 30), (i * 5) % 12, 1 + (i % 27)));
    return {
      companyId,
      name,
      phone: `1190000${String(1000 + i).padStart(4, '0')}`,
      email: `${name.split(' ')[0].toLowerCase()}.${i}@exemplo.com`,
      birthDate: birth,
      isVip: i % 9 === 0,
    };
  });
  const clients = await prisma.client.createManyAndReturn({
    data: clientsData,
    select: { id: true },
  });

  // Agenda: dias úteis do passado e do futuro, cada profissional com horários seguidos e folgas.
  type NewAppointment = {
    companyId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    status: AppointmentStatus;
    serviceNameSnapshot: string;
    durationMinutesSnapshot: number;
    priceSnapshot: number;
    createdByUserId: string;
    canceledAt?: Date;
  };
  const appointments: NewAppointment[] = [];
  for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
    const day: CalendarDate = addDays(today, offset);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (weekday === 0) continue;
    // O futuro vai ficando mais vazio, como numa agenda de verdade.
    const fill = offset < 0 ? 0.72 : offset === 0 ? 0.8 : Math.max(0.25, 0.65 - offset * 0.04);
    for (const professional of professionals) {
      let minute = OPEN;
      while (minute < CLOSE) {
        const service = pick(services);
        if (minute + service.durationMinutes > CLOSE) break;
        if (rand() < fill) {
          const startAt = calendarDateToUtc(day, minute, timezone);
          const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
          const past = endAt.getTime() < now;
          const roll = rand();
          const status: AppointmentStatus = past
            ? roll < 0.86
              ? 'DONE'
              : roll < 0.94
                ? 'CANCELED'
                : 'NO_SHOW'
            : roll < 0.6
              ? 'CONFIRMED'
              : 'SCHEDULED';
          appointments.push({
            companyId,
            clientId: pick(clients).id,
            professionalId: professional.id,
            serviceId: service.id,
            startAt,
            endAt,
            status,
            serviceNameSnapshot: service.name,
            durationMinutesSnapshot: service.durationMinutes,
            priceSnapshot: Number(service.price),
            createdByUserId: DEMO_CREATED_BY,
            ...(status === 'CANCELED' ? { canceledAt: startAt } : {}),
          });
          minute += service.durationMinutes;
        } else {
          minute += 30;
        }
        minute += pick([0, 0, 15]);
      }
    }
  }
  const created = await prisma.appointment.createManyAndReturn({
    data: appointments,
    select: {
      id: true,
      status: true,
      clientId: true,
      endAt: true,
      priceSnapshot: true,
      serviceNameSnapshot: true,
    },
  });

  // Caixa: cada atendimento concluído vira entrada paga, como a comanda grava; e algumas despesas.
  const incomes = created
    .filter((a) => a.status === 'DONE')
    .map((a) => ({
      companyId,
      type: 'INCOME' as const,
      status: 'PAID' as const,
      description: a.serviceNameSnapshot,
      category: 'Atendimento',
      amount: a.priceSnapshot,
      paymentMethod: pick(PAYMENTS),
      paidAt: a.endAt,
      appointmentId: a.id,
      clientId: a.clientId,
      createdByUserId: DEMO_CREATED_BY,
    }));
  const expenses = [
    { description: 'Aluguel', category: 'Aluguel', amount: 2500, daysAgo: 20 },
    { description: 'Produtos para revenda', category: 'Produtos', amount: 780, daysAgo: 12 },
    { description: 'Energia elétrica', category: 'Contas', amount: 340, daysAgo: 8 },
    { description: 'Internet', category: 'Contas', amount: 120, daysAgo: 5 },
  ].map((e) => ({
    companyId,
    type: 'EXPENSE' as const,
    status: 'PAID' as const,
    description: e.description,
    category: e.category,
    amount: e.amount,
    paymentMethod: 'PIX' as const,
    paidAt: new Date(now - e.daysAgo * 86_400_000),
    createdByUserId: DEMO_CREATED_BY,
  }));
  await prisma.transaction.createMany({ data: [...incomes, ...expenses] });

  // Estoque com dois itens abaixo do mínimo, para o aviso de estoque baixo aparecer.
  await prisma.product.createMany({
    data: [
      { name: 'Sérum facial', costPrice: 45, salePrice: 89, quantity: 14, minQuantity: 5 },
      { name: 'Óleo de massagem', costPrice: 30, salePrice: 59, quantity: 3, minQuantity: 6 },
      { name: 'Esmalte (unidade)', costPrice: 6, salePrice: 15, quantity: 40, minQuantity: 10 },
      { name: 'Protetor solar', costPrice: 38, salePrice: 79, quantity: 2, minQuantity: 4 },
      { name: 'Hidratante corporal', costPrice: 25, salePrice: 55, quantity: 18, minQuantity: 5 },
    ].map((p) => ({ ...p, companyId })),
  });

  return {
    professionals: professionals.length,
    services: services.length,
    clients: clients.length,
    appointments: created.length,
  };
}
