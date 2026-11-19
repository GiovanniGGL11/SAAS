'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { StethoscopeIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { unwrapResult } from '@/lib/action-result';
import { SEGMENT_GROUPS } from '@/lib/onboarding/templates';
import { isMedicalSegment, medicalRecordsEnabled } from '@/lib/medical-records';
import { saveMedicalRecordsSettingsAction } from '@/server/actions/medical-record-actions';
import { SettingsGroup } from '@/components/configuracoes/timezone-card';

type Mode = 'auto' | 'on' | 'off';

/** Configurações › Ramo e prontuário: o ramo do negócio e se a área de Prontuário aparece. */
export function MedicalRecordsCard({
  segment: initialSegment,
  mode: initialMode,
}: {
  segment: string | null;
  mode: string | null;
}) {
  const router = useRouter();
  const [segment, setSegment] = React.useState<string | null>(initialSegment);
  const [mode, setMode] = React.useState<Mode>(
    initialMode === 'on' || initialMode === 'off' ? initialMode : 'auto',
  );
  const save = useMutation({
    mutationFn: (next: { segment: string | null; mode: Mode }) =>
      saveMedicalRecordsSettingsAction(next).then(unwrapResult),
    onSuccess: () => {
      toast.success('Salvo.');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = (patch: Partial<{ segment: string | null; mode: Mode }>) => {
    const next = { segment, mode, ...patch };
    setSegment(next.segment);
    setMode(next.mode);
    save.mutate(next);
  };
  const enabled = medicalRecordsEnabled({
    segment,
    medicalRecordsMode: mode === 'auto' ? null : mode,
  });

  return (
    <SettingsGroup title="Ramo e prontuário">
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#30b0c7] text-white">
            <StethoscopeIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Ramo do negócio</div>
            <div className="text-label-secondary text-[13px]">
              Define os modelos de evolução do prontuário e o que aparece para o seu tipo de
              negócio.
            </div>
          </div>
          <Select
            value={segment ?? ''}
            onValueChange={(v: string) => update({ segment: v || null })}
          >
            <SelectTrigger className="w-full sm:w-64" aria-label="Ramo do negócio">
              <SelectValue placeholder="Escolha o ramo" />
            </SelectTrigger>
            <SelectContent>
              {SEGMENT_GROUPS.map((g) => (
                <SelectGroup key={g.title}>
                  <SelectLabel>{g.title}</SelectLabel>
                  {g.items.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium">Prontuário do paciente</div>
          <SegmentedControl
            size="sm"
            className="self-start"
            value={mode}
            onValueChange={(v) => update({ mode: v })}
            options={[
              { value: 'auto', label: 'Pelo ramo' },
              { value: 'on', label: 'Ligado' },
              { value: 'off', label: 'Desligado' },
            ]}
          />
          <p className="text-label-secondary text-[13px]">
            {enabled
              ? 'Ligado: na ficha de cada cliente aparece o botão Prontuário, com evolução, alertas da anamnese, fichas e registros.'
              : 'Desligado: a ficha do cliente continua como está.'}
            {mode === 'auto' &&
              (isMedicalSegment(segment)
                ? ' Seu ramo usa prontuário, então ele liga sozinho.'
                : ' Ele liga sozinho nos ramos de saúde, estética e odontologia.')}
          </p>
        </div>
      </div>
    </SettingsGroup>
  );
}
