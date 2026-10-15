import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'moved'
  | 'status_changed'
  | 'canceled'
  | 'deleted'
  // Fichas e pacotes: quem viu, exportou, enviou, revisou, assinou. Nunca com o conteúdo.
  | 'viewed'
  | 'exported'
  | 'requested'
  | 'submitted'
  | 'reviewed'
  | 'link_created'
  | 'link_revoked'
  | 'archived'
  | 'restored'
  | 'finalized'
  | 'amended'
  | 'signed'
  | 'adjusted';

export async function recordAuditLog(
  params: {
    companyId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    userId: string;
    metadata?: Prisma.InputJsonValue;
  },
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      companyId: params.companyId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      userId: params.userId,
      metadata: params.metadata,
    },
  });
}
