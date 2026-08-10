import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const DEMO_CLERK_ORG_ID = 'org_demo_seed';

async function main() {
  const company = await prisma.company.upsert({
    where: { clerkOrgId: DEMO_CLERK_ORG_ID },
    update: {},
    create: {
      clerkOrgId: DEMO_CLERK_ORG_ID,
      name: 'Barbearia Demo',
      slug: 'barbearia-demo',
      timezone: 'America/Sao_Paulo',
    },
  });

  const professionalsData = [
    { name: 'Carlos Silva', color: '#f97316', email: 'carlos@barbearia-demo.test' },
    { name: 'Ana Souza', color: '#8b5cf6', email: 'ana@barbearia-demo.test' },
    { name: 'Bruno Costa', color: '#0ea5e9', email: 'bruno@barbearia-demo.test' },
  ];

  const professionals = [];
  for (const data of professionalsData) {
    const professional = await prisma.professional.upsert({
      where: { companyId_email: { companyId: company.id, email: data.email } },
      update: {},
      create: { ...data, companyId: company.id },
    });
    professionals.push(professional);

    for (let weekday = 1; weekday <= 5; weekday++) {
      await prisma.professionalAvailability.upsert({
        where: {
          id: `${professional.id}-availability-${weekday}`,
        },
        update: {},
        create: {
          id: `${professional.id}-availability-${weekday}`,
          professionalId: professional.id,
          weekday,
          startTime: '09:00',
          endTime: '19:00',
        },
      });
    }
  }

  const servicesData = [
    { name: 'Corte Masculino', durationMinutes: 30, price: 50, color: '#f97316' },
    { name: 'Barba', durationMinutes: 20, price: 35, color: '#0ea5e9' },
    { name: 'Corte + Barba', durationMinutes: 50, price: 80, color: '#22c55e' },
    { name: 'Sobrancelha', durationMinutes: 15, price: 20, color: '#eab308' },
    { name: 'Coloração', durationMinutes: 60, price: 100, color: '#a855f7' },
  ];

  const services = [];
  for (const data of servicesData) {
    const existing = await prisma.service.findFirst({
      where: { companyId: company.id, name: data.name },
    });
    const service =
      existing ??
      (await prisma.service.create({
        data: { ...data, companyId: company.id },
      }));
    services.push(service);
  }

  const clientsData = [
    { name: 'João Pereira', phone: '11999990001' },
    { name: 'Marcos Lima', phone: '11999990002' },
    { name: 'Rafael Alves', phone: '11999990003' },
    { name: 'Fernanda Dias', phone: '11999990004' },
    { name: 'Camila Rocha', phone: '11999990005' },
    { name: 'Lucas Martins', phone: '11999990006' },
    { name: 'Beatriz Nunes', phone: '11999990007' },
    { name: 'Gustavo Ramos', phone: '11999990008' },
  ];

  const clients = [];
  for (const data of clientsData) {
    const client = await prisma.client.upsert({
      where: { companyId_phone: { companyId: company.id, phone: data.phone } },
      update: {},
      create: { ...data, companyId: company.id },
    });
    clients.push(client);
  }

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const existingAppointments = await prisma.appointment.count({ where: { companyId: company.id } });

  if (existingAppointments === 0) {
    let seedIndex = 0;
    for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
      const day = new Date(startOfWeek);
      day.setDate(day.getDate() + dayOffset);

      const slotsPerDay = 3;
      for (let slot = 0; slot < slotsPerDay; slot++) {
        const professional = professionals[seedIndex % professionals.length];
        const service = services[seedIndex % services.length];
        const client = clients[seedIndex % clients.length];

        const startAt = new Date(day);
        startAt.setHours(9 + slot * 3, 0, 0, 0);
        const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

        await prisma.appointment.create({
          data: {
            companyId: company.id,
            clientId: client.id,
            professionalId: professional.id,
            serviceId: service.id,
            startAt,
            endAt,
            status: dayOffset < 3 ? 'DONE' : 'SCHEDULED',
            serviceNameSnapshot: service.name,
            durationMinutesSnapshot: service.durationMinutes,
            priceSnapshot: service.price,
            createdByUserId: 'seed_script',
          },
        });

        seedIndex++;
      }
    }
  }

  console.log(`Seed concluído para empresa demo: ${company.name} (${company.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
