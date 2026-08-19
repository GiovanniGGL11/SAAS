import { z } from 'zod';

export const BRAZIL_TIMEZONES = [
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco / Acre (UTC-5)' },
] as const;

export const updateCompanyTimezoneInput = z.object({
  timezone: z.enum(BRAZIL_TIMEZONES.map((t) => t.value) as [string, ...string[]]),
});
