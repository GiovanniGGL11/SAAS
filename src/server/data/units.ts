import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { upsertCompanyFromClerkOrg } from '@/server/data/company';
import { resolveReportRange } from '@/lib/report-range';
import { getPeriodInsights, getTodayOverview } from '@/server/data/insights';

/*
  Várias unidades: cada unidade é uma organização no Clerk (uma empresa aqui). O dono que é admin
  de mais de uma vê os números de todas lado a lado e o total.
*/

export async function listAdminUnits(userId: string) {
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId, limit: 100 });
  const adminOrgs = memberships.data
    .filter((m) => m.role === 'org:admin')
    .map((m) => m.organization);
  if (adminOrgs.length === 0) return [];
  const adminOrgIds = adminOrgs.map((o) => o.id);
  // Unidade criada agora e ainda nunca aberta não tem empresa no banco: cria aqui para aparecer.
  const known = new Set(
    (
      await prisma.company.findMany({
        where: { clerkOrgId: { in: adminOrgIds } },
        select: { clerkOrgId: true },
      })
    ).map((c) => c.clerkOrgId),
  );
  for (const org of adminOrgs) {
    if (!known.has(org.id))
      await upsertCompanyFromClerkOrg({ id: org.id, name: org.name, slug: org.slug });
  }
  const companies = await prisma.company.findMany({
    where: { clerkOrgId: { in: adminOrgIds }, deletedAt: null },
    select: { id: true, name: true, clerkOrgId: true, timezone: true },
    orderBy: { name: 'asc' },
  });
  return companies;
}

export async function getUnitsOverview(userId: string) {
  const units = await listAdminUnits(userId);
  const rows = await Promise.all(
    units.map(async (unit) => {
      const range = resolveReportRange('thisMonth', unit.timezone);
      const [insights, today] = await Promise.all([
        getPeriodInsights(unit.id, unit.timezone, range),
        getTodayOverview(unit.id, unit.timezone),
      ]);
      return {
        id: unit.id,
        clerkOrgId: unit.clerkOrgId,
        name: unit.name,
        revenue: insights.current.revenue,
        revenuePrev: insights.previous.revenue,
        completed: insights.current.completed,
        avgTicket: insights.current.avgTicket,
        occupancy: insights.current.occupancy,
        returningRate: insights.current.returningRate,
        lossRate: insights.current.lossRate,
        today: today.appointments,
        cashOpen: today.cashOpen,
      };
    }),
  );
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCompleted = rows.reduce((s, r) => s + r.completed, 0);
  return {
    rows,
    totals: {
      revenue: Math.round(totalRevenue * 100) / 100,
      revenuePrev: Math.round(rows.reduce((s, r) => s + r.revenuePrev, 0) * 100) / 100,
      completed: totalCompleted,
      avgTicket: totalCompleted ? Math.round((totalRevenue / totalCompleted) * 100) / 100 : 0,
      today: rows.reduce((s, r) => s + r.today, 0),
    },
  };
}
