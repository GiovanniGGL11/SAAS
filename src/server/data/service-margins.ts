import { prisma } from '@/lib/db';

/*
  Margem de contribuição por serviço, a partir do cadastro (não de estimativa):
  preço − materiais (ficha de consumo do serviço × custo do produto) − comissão própria do serviço.
  Quando a comissão depende do profissional, o valor não é inventado: aparece como "varia".
*/

export async function listServiceMargins(companyId: string) {
  const services = await prisma.service.findMany({
    where: { companyId, active: true },
    select: {
      id: true,
      name: true,
      price: true,
      commissionPercent: true,
      supplies: {
        select: { quantity: true, product: { select: { name: true, costPrice: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  return services.map((s) => {
    const price = Number(s.price);
    const materials =
      Math.round(
        s.supplies.reduce((sum, sup) => sum + sup.quantity * Number(sup.product.costPrice), 0) *
          100,
      ) / 100;
    const commission =
      s.commissionPercent == null ? null : Math.round(price * s.commissionPercent) / 100;
    const margin = Math.round((price - materials - (commission ?? 0)) * 100) / 100;
    return {
      id: s.id,
      name: s.name,
      price,
      materials,
      materialItems: s.supplies.map((sup) => `${sup.quantity}× ${sup.product.name}`),
      commission,
      margin,
      marginPercent: price > 0 ? Math.round((margin / price) * 1000) / 10 : null,
      commissionVaries: s.commissionPercent == null,
    };
  });
}

export type ServiceMargin = Awaited<ReturnType<typeof listServiceMargins>>[number];
