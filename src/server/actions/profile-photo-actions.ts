'use server';

import { currentUser } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { getViewerScope } from '@/server/auth/professional-scope';

/**
 * A foto da conta do profissional (a que ele troca no próprio celular, no menu da foto) vira a
 * foto do cadastro dele — a da agenda e da lista de profissionais. A última foto que ele puser
 * substitui a anterior. Não recebe nada do navegador: a foto é lida direto do Clerk.
 */
export async function syncMyProfilePhotoAction(): Promise<{ updated: boolean }> {
  const { session, professional } = await getViewerScope();
  if (!professional) return { updated: false };
  const user = await currentUser();
  // Sem foto própria o Clerk devolve um avatar genérico: não substitui a foto do cadastro.
  if (!user?.hasImage || !user.imageUrl) return { updated: false };
  const result = await prisma.professional.updateMany({
    where: {
      id: professional.id,
      companyId: session.company.id,
      NOT: { avatarUrl: user.imageUrl },
    },
    data: { avatarUrl: user.imageUrl },
  });
  return { updated: result.count > 0 };
}
