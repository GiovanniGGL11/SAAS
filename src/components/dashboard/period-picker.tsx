'use client';

import { usePathname, useRouter } from 'next/navigation';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';

/** Período do dashboard no endereço (?periodo=last7), para a página ser renderizada no servidor. */
export function PeriodPicker({ value }: { value: ReportPreset }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <SegmentedControl
      value={value}
      onValueChange={(next) => router.replace(`${pathname}?periodo=${next}`, { scroll: false })}
      options={REPORT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      className="max-w-full overflow-x-auto"
    />
  );
}
