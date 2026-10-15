import { prisma } from '@/lib/db';
import { recordAuditLog } from '@/server/data/audit';
import { UserError } from '@/server/errors';

/**
 * Quem pode o quê nas fichas. O status ("enviada", "aguardando revisão") é de toda a equipe —
 * a recepção precisa saber se o cliente já respondeu. Ler, preencher, revisar e exportar as
 * respostas só com permissão explícita, inclusive para administradores: ser dono do negócio não
 * dá acesso automático a informação de saúde. O administrador concede (até para si mesmo), e a
 * concessão fica registrada no histórico.
 */

export type FormAccessScope = 'ALL' | 'OWN';

export type FormAccess = {
  userId: string;
  isAdmin: boolean;
  /** Criar, editar e arquivar modelos. */
  canManage: boolean;
  /** Pedir fichas e gerar link para o cliente. */
  canRequest: boolean;
  canRead: boolean;
  canFill: boolean;
  canReview: boolean;
  canExport: boolean;
  /** Ver o histórico de acessos e alterações (sem o conteúdo das respostas). */
  canAudit: boolean;
  /** Conceder e retirar permissões: só administradores. */
  canGrant: boolean;
  scope: FormAccessScope;
  /** Profissional ligado a esta pessoa (pelo e-mail), para o escopo "só os meus". */
  professionalId: string | null;
};

export type FormAccessFlags = Pick<
  FormAccess,
  'canManage' | 'canRequest' | 'canRead' | 'canFill' | 'canReview' | 'canExport' | 'canAudit'
> & { scope: FormAccessScope };

export const NO_GRANT: FormAccessFlags = {
  canManage: false,
  canRequest: true,
  canRead: false,
  canFill: false,
  canReview: false,
  canExport: false,
  canAudit: false,
  scope: 'ALL',
};

/** Regra pura: o que vale para a pessoa, dado o papel e a linha de permissão (se houver). */
export function resolveFormAccess(params: {
  userId: string;
  isAdmin: boolean;
  grant: FormAccessFlags | null;
  professionalId: string | null;
}): FormAccess {
  const grant = params.grant ?? NO_GRANT;
  return {
    userId: params.userId,
    isAdmin: params.isAdmin,
    // Estrutura dos modelos e auditoria não expõem respostas: administradores sempre podem.
    canManage: params.isAdmin || grant.canManage,
    canRequest: params.isAdmin || grant.canRequest,
    canRead: grant.canRead,
    // Preencher e revisar exigem ver as respostas.
    canFill: grant.canFill && grant.canRead,
    canReview: grant.canReview && grant.canRead,
    canExport: grant.canExport && grant.canRead,
    canAudit: params.isAdmin || grant.canAudit,
    canGrant: params.isAdmin,
    scope: grant.scope,
    professionalId: params.professionalId,
  };
}

export async function professionalIdForEmails(companyId: string, emails: string[]) {
  const normalized = emails.map((e) => e.toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return null;
  const professionals = await prisma.professional.findMany({
    where: { companyId, email: { not: null } },
    select: { id: true, email: true },
  });
  return (
    professionals.find((p) => p.email && normalized.includes(p.email.toLowerCase()))?.id ?? null
  );
}

export async function loadFormAccess(params: {
  companyId: string;
  userId: string;
  isAdmin: boolean;
  emails: string[];
}): Promise<FormAccess> {
  const [grant, professionalId] = await Promise.all([
    prisma.formPermission.findUnique({
      where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
    }),
    professionalIdForEmails(params.companyId, params.emails),
  ]);
  return resolveFormAccess({
    userId: params.userId,
    isAdmin: params.isAdmin,
    grant,
    professionalId,
  });
}

/**
 * A ficha está no alcance da pessoa? "Só os meus": fichas de atendimentos do próprio
 * profissional ou de pacotes em que ele é o responsável. Sem profissional ligado, nenhuma.
 */
export function entryInScope(
  access: Pick<FormAccess, 'scope' | 'professionalId'>,
  entry: {
    appointmentProfessionalId: string | null;
    packageProfessionalId: string | null;
    sessionProfessionalId: string | null;
  },
): boolean {
  if (access.scope === 'ALL') return true;
  if (!access.professionalId) return false;
  return [
    entry.appointmentProfessionalId,
    entry.packageProfessionalId,
    entry.sessionProfessionalId,
  ].includes(access.professionalId);
}

export function requireAccess(access: FormAccess, flag: keyof FormAccessFlags, what: string) {
  if (flag === 'scope' || !access[flag]) {
    throw new UserError(`Você não tem permissão para ${what}. Peça a um administrador.`);
  }
}

export async function listFormPermissions(companyId: string) {
  const rows = await prisma.formPermission.findMany({ where: { companyId } });
  return rows.map((r) => ({
    userId: r.userId,
    canManage: r.canManage,
    canRequest: r.canRequest,
    canRead: r.canRead,
    canFill: r.canFill,
    canReview: r.canReview,
    canExport: r.canExport,
    canAudit: r.canAudit,
    scope: r.scope,
    updatedAt: r.updatedAt,
  }));
}

export async function setFormPermission(params: {
  companyId: string;
  userId: string;
  flags: FormAccessFlags;
  updatedByUserId: string;
}) {
  const before = await prisma.formPermission.findUnique({
    where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
  });
  const data = { ...params.flags, updatedByUserId: params.updatedByUserId };
  const row = await prisma.formPermission.upsert({
    where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
    create: { companyId: params.companyId, userId: params.userId, ...data },
    update: data,
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'FormPermission',
    entityId: row.id,
    action: before ? 'updated' : 'created',
    userId: params.updatedByUserId,
    metadata: {
      targetUserId: params.userId,
      ...params.flags,
    },
  });
  return row;
}
