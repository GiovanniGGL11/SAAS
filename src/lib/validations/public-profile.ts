import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

/** "@meusalao", "instagram.com/meusalao/" ou "meusalao" → "meusalao". */
export function normalizeInstagram(value: string | null | undefined): string | null {
  const handle = (value ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  return handle || null;
}

/** O que a empresa mostra na página pública de agendamento. */
export const publicProfileInput = z.object({
  zipCode: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 8, 'CEP com 8 dígitos.')
    .transform((v) => v || null)
    .nullable()
    .optional(),
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'UF com 2 letras.')
    .transform((v) => v || null)
    .nullable()
    .optional(),
  instagram: z
    .string()
    .max(120)
    .transform(normalizeInstagram)
    .refine((v) => v === null || /^[A-Za-z0-9._]{1,30}$/.test(v), 'Instagram inválido.')
    .nullable()
    .optional(),
  cancellationPolicy: optionalText(1000),
});

export type PublicProfileInput = z.input<typeof publicProfileInput>;
