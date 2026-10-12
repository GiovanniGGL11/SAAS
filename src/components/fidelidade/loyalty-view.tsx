'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GiftIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, Surface } from '@/components/layout/page';
import {
  InitialsAvatar,
  ListToolbar,
  SearchField,
  matchesSearch,
} from '@/components/layout/list-controls';
import { LoyaltyCard } from '@/components/fidelidade/loyalty-card';
import {
  getLoyaltyOverviewAction,
  saveLoyaltyProgramAction,
} from '@/server/actions/loyalty-actions';
import {
  LOYALTY_MODES,
  LOYALTY_REWARD_TYPES,
  loyaltyProgramInput,
} from '@/lib/validations/loyalty';
import {
  describeRule,
  formatLoyaltyAmount,
  rewardThreshold,
  type LoyaltyRules,
} from '@/lib/loyalty';
import type { SerializedLoyaltyProgram, SerializedService } from '@/lib/serialize';

type Overview = Awaited<ReturnType<typeof getLoyaltyOverviewAction>>;
type Mode = LoyaltyRules['mode'];
type RewardType = LoyaltyRules['rewardType'];

type FormState = {
  active: boolean;
  mode: Mode;
  stampsRequired: string;
  pointsPerReal: string;
  pointsRequired: string;
  cashbackPercent: string;
  rewardType: RewardType;
  rewardServiceId: string;
  rewardValue: string;
  rewardDescription: string;
};

const MODE_HINT: Record<Mode, string> = {
  STAMPS: 'Cada atendimento concluído vale 1 selo. Completou o cartão, ganhou a recompensa.',
  POINTS: 'O cliente ganha pontos proporcionais ao valor de cada atendimento.',
  CASHBACK: 'Uma porcentagem de cada atendimento volta como saldo para descontos.',
};

function toFormState(
  program: SerializedLoyaltyProgram | null,
  services: SerializedService[],
): FormState {
  return {
    // A brand-new program saves as active — configuring it is the intent to turn it on.
    active: program?.active ?? true,
    mode: program?.mode ?? 'STAMPS',
    stampsRequired: String(program?.stampsRequired ?? 10),
    pointsPerReal: String(program?.pointsPerReal ?? 1),
    pointsRequired: String(program?.pointsRequired ?? 100),
    cashbackPercent: String(program?.cashbackPercent ?? 5),
    rewardType: program?.rewardType ?? 'FREE_SERVICE',
    rewardServiceId: program?.rewardServiceId ?? services[0]?.id ?? '',
    rewardValue: program?.rewardValue != null ? String(program.rewardValue) : '',
    rewardDescription: program?.rewardDescription ?? '',
  };
}

function toRules(form: FormState, services: SerializedService[]): LoyaltyRules {
  const num = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const service = services.find((s) => s.id === form.rewardServiceId);
  return {
    mode: form.mode,
    stampsRequired: Math.max(num(form.stampsRequired), 1),
    pointsPerReal: num(form.pointsPerReal),
    pointsRequired: Math.max(num(form.pointsRequired), 1),
    cashbackPercent: num(form.cashbackPercent),
    rewardType: form.rewardType,
    rewardValue: form.rewardValue === '' ? null : num(form.rewardValue),
    rewardDescription: form.rewardDescription || null,
    rewardService: service ? { name: service.name } : null,
  };
}

function sampleBalance(rules: LoyaltyRules): number {
  if (rules.mode === 'CASHBACK') return 12.5;
  return Math.max(Math.round((rewardThreshold(rules) ?? 1) * 0.6), 1);
}

export function LoyaltyView({
  initialData,
  services,
}: {
  initialData: Overview;
  services: SerializedService[];
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['loyalty-overview'],
    queryFn: getLoyaltyOverviewAction,
    initialData,
  });

  const [form, setForm] = React.useState(() => toFormState(initialData.program, services));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  }

  const save = useMutation({
    mutationFn: saveLoyaltyProgramAction,
    onSuccess: () => {
      toast.success('Programa de fidelidade salvo.');
      queryClient.invalidateQueries({ queryKey: ['loyalty-overview'] });
      queryClient.invalidateQueries({ queryKey: ['client-loyalty'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  function handleSave() {
    const result = loyaltyProgramInput.safeParse({
      ...form,
      rewardServiceId: form.rewardServiceId || null,
      rewardValue: form.rewardValue === '' ? null : form.rewardValue,
      rewardDescription: form.rewardDescription || null,
    });
    if (!result.success) {
      setErrors(
        Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
      );
      return;
    }
    save.mutate(result.data);
  }

  const rules = toRules(form, services);
  const savedProgram = data.program;
  const switchingModeWithBalances =
    !!savedProgram && savedProgram.mode !== form.mode && data.members.length > 0;

  const members = data.members.filter((member) => matchesSearch(search, member.name, member.phone));
  const savedThreshold = savedProgram ? rewardThreshold(savedProgram) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fidelidade"
        description={
          savedProgram?.active
            ? describeRule(savedProgram)
            : 'Recompense quem volta: escolha o modelo e a recompensa do seu programa.'
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Surface className="flex flex-col gap-6 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[15px] font-semibold">Programa ativo</div>
              <div className="text-label-secondary text-[13px]">
                Atendimentos concluídos passam a render para o cliente.
              </div>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(checked: boolean) => update('active', checked)}
              aria-label="Programa ativo"
            />
          </div>

          <Section title="Modelo">
            <SegmentedControl
              value={form.mode}
              onValueChange={(mode) => update('mode', mode)}
              options={LOYALTY_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
            />
            <p className="text-label-secondary text-[13px]">{MODE_HINT[form.mode]}</p>
            {switchingModeWithBalances && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                Trocar o modelo começa os saldos dos clientes do zero. O histórico antigo continua
                guardado.
              </p>
            )}
          </Section>

          <Section title="Regras">
            {form.mode === 'STAMPS' && (
              <NumberField
                id="stampsRequired"
                label="Selos para ganhar a recompensa"
                value={form.stampsRequired}
                onChange={(value) => update('stampsRequired', value)}
                error={errors.stampsRequired}
                step={1}
              />
            )}
            {form.mode === 'POINTS' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  id="pointsPerReal"
                  label="Pontos por R$ 1 gasto"
                  value={form.pointsPerReal}
                  onChange={(value) => update('pointsPerReal', value)}
                  error={errors.pointsPerReal}
                  step={0.1}
                />
                <NumberField
                  id="pointsRequired"
                  label="Pontos para ganhar a recompensa"
                  value={form.pointsRequired}
                  onChange={(value) => update('pointsRequired', value)}
                  error={errors.pointsRequired}
                  step={1}
                />
              </div>
            )}
            {form.mode === 'CASHBACK' && (
              <NumberField
                id="cashbackPercent"
                label="Cashback (% de cada atendimento)"
                value={form.cashbackPercent}
                onChange={(value) => update('cashbackPercent', value)}
                error={errors.cashbackPercent}
                step={0.5}
              />
            )}
          </Section>

          {form.mode !== 'CASHBACK' && (
            <Section title="Recompensa">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rewardType">Tipo</Label>
                  <Select
                    value={form.rewardType}
                    onValueChange={(value: string) => update('rewardType', value as RewardType)}
                  >
                    <SelectTrigger id="rewardType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOYALTY_REWARD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.rewardType === 'FREE_SERVICE' && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rewardServiceId">Serviço</Label>
                    {services.length === 0 ? (
                      <p className="text-label-secondary text-[13px]">
                        Cadastre um serviço em{' '}
                        <Link href="/servicos" className="text-primary underline-offset-2 hover:underline">
                          Serviços
                        </Link>{' '}
                        primeiro.
                      </p>
                    ) : (
                      <Select
                        value={form.rewardServiceId}
                        onValueChange={(value: string) => update('rewardServiceId', value)}
                      >
                        <SelectTrigger id="rewardServiceId" className="w-full">
                          <SelectValue placeholder="Escolha o serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FieldError message={errors.rewardServiceId} />
                  </div>
                )}

                {(form.rewardType === 'PERCENT_DISCOUNT' ||
                  form.rewardType === 'FIXED_DISCOUNT') && (
                  <NumberField
                    id="rewardValue"
                    label={form.rewardType === 'PERCENT_DISCOUNT' ? 'Desconto (%)' : 'Desconto (R$)'}
                    value={form.rewardValue}
                    onChange={(value) => update('rewardValue', value)}
                    error={errors.rewardValue}
                    step={form.rewardType === 'PERCENT_DISCOUNT' ? 1 : 0.01}
                  />
                )}

                {form.rewardType === 'CUSTOM' && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rewardDescription">Recompensa</Label>
                    <Input
                      id="rewardDescription"
                      placeholder="Ex: Hidratação de brinde"
                      value={form.rewardDescription}
                      onChange={(event) => update('rewardDescription', event.target.value)}
                    />
                    <FieldError message={errors.rewardDescription} />
                  </div>
                )}
              </div>
            </Section>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar programa'}
            </Button>
          </div>
        </Surface>

        <div className="flex flex-col gap-2 lg:sticky lg:top-6">
          <div className="text-label-secondary px-1 text-[13px] font-medium">
            Prévia do cartão do cliente
          </div>
          <LoyaltyCard rules={rules} balance={sampleBalance(rules)} holder="Maria Souza" />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Clientes no programa</h2>
        {data.members.length > 0 && (
          <ListToolbar>
            <SearchField value={search} onChange={setSearch} placeholder="Buscar cliente" />
          </ListToolbar>
        )}
        <Surface>
          {members.length === 0 ? (
            <EmptyState
              icon={GiftIcon}
              title={data.members.length === 0 ? 'Ninguém no programa ainda' : 'Nenhum cliente encontrado'}
              description={
                data.members.length === 0
                  ? 'Os clientes aparecem aqui conforme acumulam saldo nos atendimentos concluídos.'
                  : 'Ajuste a busca.'
              }
            />
          ) : (
            <ul className="divide-foreground/[0.06] divide-y">
              {members.map((member) => {
                const ready = savedThreshold !== null && member.balance >= savedThreshold;
                return (
                  <li key={member.id}>
                    <Link
                      href={`/clientes/${member.id}`}
                      className="hover:bg-foreground/[0.03] flex items-center gap-3 px-5 py-3 transition-colors"
                    >
                      <InitialsAvatar name={member.name} color="#007aff" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{member.name}</div>
                        {member.phone && (
                          <div className="text-label-secondary text-[13px]">{member.phone}</div>
                        )}
                      </div>
                      {ready && (
                        <span className="bg-system-blue/12 text-system-blue flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold">
                          <GiftIcon className="size-3.5" />
                          Recompensa liberada
                        </span>
                      )}
                      <span className="text-[15px] font-semibold tabular-nums">
                        {savedProgram ? formatLoyaltyAmount(savedProgram.mode, member.balance) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-foreground/[0.06] flex flex-col gap-3 border-t pt-5">
      <div className="text-label-secondary text-[13px] font-medium">{title}</div>
      {children}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  step: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-48"
      />
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-[13px]">{message}</p>;
}
