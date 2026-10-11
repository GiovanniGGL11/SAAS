'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2Icon, GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme } from '@/components/theme-provider';
import { updateCompanyTimezoneAction } from '@/server/actions/company-actions';
import { BRAZIL_TIMEZONES } from '@/lib/validations/company';

/** One row of an Apple Settings–style grouped list. */
function SettingsRow({
  icon: Icon,
  color,
  label,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white"
        style={{ backgroundColor: color }}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{label}</div>
        {description && <div className="text-label-secondary text-[13px]">{description}</div>}
      </div>
      <div className="w-full sm:w-auto">{children}</div>
    </div>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label-secondary px-5 text-[13px] font-medium uppercase">{title}</h2>
      <div className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
        {children}
      </div>
    </section>
  );
}

export function TimezoneCard({ companyName, timezone }: { companyName: string; timezone: string }) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const mutation = useMutation({
    mutationFn: (tz: string) => updateCompanyTimezoneAction({ timezone: tz }),
    onSuccess: () => {
      toast.success('Fuso horário atualizado.');
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  return (
    <>
      <SettingsGroup title="Empresa">
        <SettingsRow
          icon={Building2Icon}
          color="#007aff"
          label="Nome"
          description="Altere o nome na seção Organização, abaixo."
        >
          <span className="text-label-secondary text-[15px]">{companyName}</span>
        </SettingsRow>
        <SettingsRow
          icon={GlobeIcon}
          color="#34c759"
          label="Fuso horário"
          description="Usado na agenda, relatórios e no dashboard."
        >
          <Select
            value={timezone}
            disabled={mutation.isPending}
            onValueChange={(value: string) => mutation.mutate(value)}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAZIL_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Aparência">
        <SettingsRow
          icon={theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon}
          color="#5856d6"
          label="Tema"
          description="Automático segue a configuração do seu dispositivo."
        >
          <SegmentedControl
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
              { value: 'system', label: 'Automático' },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
