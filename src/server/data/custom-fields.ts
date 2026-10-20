import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import {
  CUSTOM_FIELD_TYPES,
  isSelect,
  normalizeValue,
  type CustomFieldEntity,
  type CustomFieldType,
  type FieldDefinition,
  type FieldOption,
} from '@/lib/custom-fields';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Campos personalizados (Profissional+). Validação sempre no servidor; quem vê e quem edita é
  configurado por campo ("toda a equipe" ou "só administradores"). Campo arquivado some das telas
  mas as respostas ficam guardadas. Não substituem regras financeiras nem de segurança: são só dados.
*/

export type FieldViewer = { userId: string; isAdmin: boolean };
const MAX_FIELDS = 40;

function toDefinition(row: {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options: Prisma.JsonValue;
}): FieldDefinition {
  return {
    id: row.id,
    label: row.label,
    type: row.type as CustomFieldType,
    required: row.required,
    options: (row.options ?? []) as FieldOption[],
  };
}

export async function listFields(
  companyId: string,
  entity: CustomFieldEntity,
  viewer: FieldViewer,
  includeArchived = false,
) {
  const rows = await prisma.customField.findMany({
    where: {
      companyId,
      entity,
      ...(includeArchived ? {} : { archived: false }),
      ...(viewer.isAdmin ? {} : { viewRole: 'all' }),
    },
    orderBy: [{ archived: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    ...toDefinition(r),
    description: r.description,
    position: r.position,
    viewRole: r.viewRole,
    editRole: r.editRole,
    archived: r.archived,
    canEdit: viewer.isAdmin || r.editRole === 'all',
  }));
}

export type FieldInput = {
  id?: string;
  entity: CustomFieldEntity;
  label: string;
  description?: string | null;
  type: CustomFieldType;
  required: boolean;
  options?: { id?: string; label: string; archived?: boolean }[];
  viewRole: 'all' | 'admin';
  editRole: 'all' | 'admin';
};

/** Cria ou altera um campo (administrador). O tipo é fixo depois de criado. */
export async function saveField(companyId: string, userId: string, input: FieldInput) {
  const label = input.label.trim().slice(0, 80);
  if (!label) throw new UserError('Dê um nome ao campo.');
  if (!CUSTOM_FIELD_TYPES.includes(input.type)) throw new UserError('Tipo inválido.');
  if (input.viewRole === 'admin' && input.editRole === 'all') {
    throw new UserError('Quem não vê o campo não pode editá-lo.');
  }
  const existing = input.id
    ? await prisma.customField.findFirst({ where: { id: input.id, companyId } })
    : null;
  if (input.id && !existing) throw new UserError('Campo não encontrado.');
  if (existing && existing.type !== input.type) {
    throw new UserError(
      'O tipo de um campo não muda depois de criado (as respostas seriam perdidas). Crie outro campo.',
    );
  }
  if (existing && existing.entity !== input.entity)
    throw new UserError('O campo é de outro cadastro.');

  let options: FieldOption[] | null = null;
  if (isSelect(input.type)) {
    const previous = ((existing?.options ?? []) as FieldOption[]) ?? [];
    const incoming = (input.options ?? [])
      .map((o) => ({ ...o, label: o.label.trim().slice(0, 80) }))
      .filter((o) => o.label);
    if (incoming.filter((o) => !o.archived).length === 0)
      throw new UserError('Inclua ao menos uma opção.');
    if (incoming.length > 50) throw new UserError('Até 50 opções.');
    const labels = incoming.filter((o) => !o.archived).map((o) => o.label.toLowerCase());
    if (new Set(labels).size !== labels.length) throw new UserError('Há opções repetidas.');
    options = incoming.map((o) => ({
      id: o.id && previous.some((p) => p.id === o.id) ? o.id : randomUUID().slice(0, 8),
      label: o.label,
      ...(o.archived ? { archived: true } : {}),
    }));
    // Opção que sumiu da lista é arquivada, nunca apagada (respostas antigas continuam legíveis).
    for (const old of previous) {
      if (!options.some((o) => o.id === old.id)) options.push({ ...old, archived: true });
    }
  }

  if (!existing) {
    const count = await prisma.customField.count({
      where: { companyId, entity: input.entity, archived: false },
    });
    if (count >= MAX_FIELDS) throw new UserError(`Até ${MAX_FIELDS} campos por cadastro.`);
  }
  const data = {
    label,
    description: input.description?.trim().slice(0, 300) || null,
    required: input.required,
    options: options ?? Prisma.JsonNull,
    viewRole: input.viewRole,
    editRole: input.editRole,
  };
  const field = existing
    ? await prisma.customField.update({ where: { id: existing.id }, data })
    : await prisma.customField.create({
        data: {
          ...data,
          companyId,
          entity: input.entity,
          type: input.type,
          position: await prisma.customField.count({ where: { companyId, entity: input.entity } }),
        },
      });
  await recordAuditLog({
    companyId,
    entityType: 'CustomField',
    entityId: field.id,
    action: existing ? 'updated' : 'created',
    userId,
    metadata: { entity: field.entity, type: field.type },
  });
  return field;
}

export async function setFieldArchived(
  companyId: string,
  userId: string,
  id: string,
  archived: boolean,
) {
  const result = await prisma.customField.updateMany({
    where: { id, companyId },
    data: { archived },
  });
  if (!result.count) throw new UserError('Campo não encontrado.');
  await recordAuditLog({
    companyId,
    entityType: 'CustomField',
    entityId: id,
    action: archived ? 'archived' : 'restored',
    userId,
  });
}

export async function reorderFields(companyId: string, entity: CustomFieldEntity, ids: string[]) {
  const fields = await prisma.customField.findMany({
    where: { companyId, entity },
    select: { id: true },
  });
  const known = new Set(fields.map((f) => f.id));
  if (ids.some((id) => !known.has(id))) throw new UserError('Campo não encontrado.');
  await prisma.$transaction(
    ids.map((id, position) => prisma.customField.update({ where: { id }, data: { position } })),
  );
}

async function assertRecord(companyId: string, entity: CustomFieldEntity, recordId: string) {
  const found =
    entity === 'client'
      ? await prisma.client.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
      : entity === 'service'
        ? await prisma.service.findFirst({
            where: { id: recordId, companyId },
            select: { id: true },
          })
        : await prisma.opportunity.findFirst({
            where: { id: recordId, companyId },
            select: { id: true },
          });
  if (!found) throw new UserError('Registro não encontrado.');
}

/** Campos visíveis para a pessoa, com as respostas deste registro. */
export async function getValues(
  companyId: string,
  entity: CustomFieldEntity,
  recordId: string,
  viewer: FieldViewer,
) {
  await assertRecord(companyId, entity, recordId);
  const fields = await listFields(companyId, entity, viewer);
  const values = fields.length
    ? await prisma.customFieldValue.findMany({
        where: { companyId, recordId, fieldId: { in: fields.map((f) => f.id) } },
      })
    : [];
  const byField = new Map(values.map((v) => [v.fieldId, v.value]));
  return fields.map((f) => ({ ...f, value: byField.get(f.id) ?? null }));
}

/**
 * Salva as respostas. Só campos ativos, visíveis e editáveis pela pessoa; obrigatórios conferidos;
 * campo que a pessoa não pode editar é ignorado se veio igual e recusado se mudou.
 */
export async function setValues(
  companyId: string,
  entity: CustomFieldEntity,
  recordId: string,
  viewer: FieldViewer,
  values: Record<string, unknown>,
) {
  await assertRecord(companyId, entity, recordId);
  const fields = await listFields(companyId, entity, viewer);
  const current = await prisma.customFieldValue.findMany({
    where: { companyId, recordId, fieldId: { in: fields.map((f) => f.id) } },
  });
  const before = new Map(current.map((v) => [v.fieldId, v.value]));
  const unknown = Object.keys(values).filter((id) => !fields.some((f) => f.id === id));
  if (unknown.length) throw new UserError('Campo inexistente ou sem permissão.');
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const changed: string[] = [];
  for (const field of fields) {
    if (!(field.id in values)) {
      if (field.required && field.canEdit && before.get(field.id) == null) {
        throw new UserError(`Preencha "${field.label}".`);
      }
      continue;
    }
    const result = normalizeValue(field, values[field.id], before.get(field.id));
    if ('error' in result) throw new UserError(result.error);
    const same =
      JSON.stringify(result.value ?? null) === JSON.stringify(before.get(field.id) ?? null);
    if (same) continue;
    if (!field.canEdit) throw new UserError(`Só administradores alteram "${field.label}".`);
    changed.push(field.id);
    ops.push(
      result.value === null
        ? prisma.customFieldValue.deleteMany({ where: { fieldId: field.id, recordId } })
        : prisma.customFieldValue.upsert({
            where: { fieldId_recordId: { fieldId: field.id, recordId } },
            create: {
              companyId,
              fieldId: field.id,
              recordId,
              value: result.value as Prisma.InputJsonValue,
              updatedByUserId: viewer.userId,
            },
            update: {
              value: result.value as Prisma.InputJsonValue,
              updatedByUserId: viewer.userId,
            },
          }),
    );
  }
  if (ops.length) await prisma.$transaction(ops);
  if (changed.length) {
    await recordAuditLog({
      companyId,
      entityType: entity === 'client' ? 'Client' : entity === 'service' ? 'Service' : 'Opportunity',
      entityId: recordId,
      action: 'updated',
      userId: viewer.userId,
      metadata: { customFields: changed },
    });
  }
  return { changed: changed.length };
}
