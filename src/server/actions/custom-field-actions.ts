'use server';

import { z } from 'zod';

import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES } from '@/lib/custom-fields';
import { toActionResult } from '@/server/action-result';
import {
  isCompanyAdmin,
  requireCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { assertFeature, hasFeature } from '@/server/billing/features';
import {
  getValues,
  listFields,
  reorderFields,
  saveField,
  setFieldArchived,
  setValues,
} from '@/server/data/custom-fields';

/* Campos personalizados (plano Profissional em diante). Configurar: só administradores. */

const entity = z.enum(CUSTOM_FIELD_ENTITIES);
const id = z.string().min(1).max(64);

export async function listFieldsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ entity, includeArchived: z.boolean().optional() }).parse(input);
    const session = await requireCurrentCompany();
    if (!hasFeature(session.company, 'customFields')) return [];
    return listFields(
      session.company.id,
      parsed.entity,
      { userId: session.userId, isAdmin: isCompanyAdmin(session) },
      parsed.includeArchived && isCompanyAdmin(session),
    );
  });
}

export async function saveFieldAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id: id.optional(),
        entity,
        label: z.string().max(80),
        description: z.string().max(300).nullish(),
        type: z.enum(CUSTOM_FIELD_TYPES),
        required: z.boolean(),
        options: z
          .array(
            z.object({
              id: z.string().max(20).optional(),
              label: z.string().max(80),
              archived: z.boolean().optional(),
            }),
          )
          .max(50)
          .optional(),
        viewRole: z.enum(['all', 'admin']),
        editRole: z.enum(['all', 'admin']),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'customFields');
    const field = await saveField(company.id, userId, parsed);
    return { id: field.id };
  });
}

export async function setFieldArchivedAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, archived: z.boolean() }).parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'customFields');
    await setFieldArchived(company.id, userId, parsed.id, parsed.archived);
  });
}

export async function reorderFieldsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ entity, ids: z.array(id).max(100) }).parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'customFields');
    await reorderFields(company.id, parsed.entity, parsed.ids);
  });
}

export async function getFieldValuesAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ entity, recordId: id }).parse(input);
    const session = await requireCurrentCompany();
    if (!hasFeature(session.company, 'customFields')) return [];
    return getValues(session.company.id, parsed.entity, parsed.recordId, {
      userId: session.userId,
      isAdmin: isCompanyAdmin(session),
    });
  });
}

export async function setFieldValuesAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ entity, recordId: id, values: z.record(z.string().max(64), z.unknown()) })
      .refine((v) => JSON.stringify(v.values).length < 100_000, 'Respostas grandes demais.')
      .parse(input);
    const session = await requireCurrentCompany();
    assertFeature(session.company, 'customFields');
    return setValues(
      session.company.id,
      parsed.entity,
      parsed.recordId,
      { userId: session.userId, isAdmin: isCompanyAdmin(session) },
      parsed.values,
    );
  });
}
