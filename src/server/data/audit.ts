import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export type AuditAction = 'created' | 'moved' | 'status_changed' | 'canceled';

export async function recordAuditLog(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
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
