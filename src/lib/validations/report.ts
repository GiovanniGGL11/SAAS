import { z } from 'zod';

export const REPORT_PRESETS = [
  { value: 'last7', label: 'Últimos 7 dias' },
  { value: 'last30', label: 'Últimos 30 dias' },
  { value: 'last90', label: 'Últimos 90 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês passado' },
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number]['value'];

export const reportPresetInput = z.object({
  preset: z.enum(REPORT_PRESETS.map((p) => p.value) as [ReportPreset, ...ReportPreset[]]),
});
