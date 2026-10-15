'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { SEGMENTS, SERVICE_TEMPLATES, type Segment } from '@/lib/onboarding/templates';
import { completeOnboardingAction } from '@/server/actions/onboarding-actions';

type ServiceRow = { name: string; duration: string; price: string; selected: boolean };
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STEPS = ['Seu negócio', 'Equipe', 'Horário', 'Agendamento online'];

const toRows = (segment: Segment): ServiceRow[] =>
  SERVICE_TEMPLATES[segment].map((t) => ({
    name: t.name,
    duration: String(t.durationMinutes),
    price: String(t.price).replace('.', ','),
    selected: true,
  }));
const parseMoney = (v: string) => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

/** Primeiro acesso: em 4 passos a conta sai com serviços, equipe, expediente e o link online. */
export function OnboardingWizard({
  companyName,
  bookingUrl,
}: {
  companyName: string;
  bookingUrl: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [segment, setSegment] = React.useState<Segment | null>(null);
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [team, setTeam] = React.useState<string[]>(['']);
  const [weekdays, setWeekdays] = React.useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('19:00');
  const [online, setOnline] = React.useState(true);

  const chosen = services.filter((s) => s.selected && s.name.trim());
  const people = team.map((t) => t.trim()).filter(Boolean);
  const canNext = [
    !!segment && chosen.length > 0,
    people.length > 0,
    weekdays.length > 0 && endTime > startTime,
    true,
  ][step];

  const finish = useMutation({
    mutationFn: () =>
      completeOnboardingAction({
        services: chosen.map((s) => ({
          name: s.name,
          durationMinutes: Number(s.duration) || 30,
          price: parseMoney(s.price),
        })),
        professionals: people.map((name) => ({ name })),
        hours: { weekdays, startTime, endTime },
        onlineBooking: online,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Tudo pronto! Sua agenda já pode receber horários.');
      router.push('/agenda');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
      <div>
        <p className="text-label-secondary text-[13px] font-semibold tracking-[0.06em] uppercase">
          Passo {step + 1} de {STEPS.length} · {STEPS[step]}
        </p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          {
            [
              `Que tipo de negócio é ${companyName}?`,
              'Quem atende?',
              'Quando vocês atendem?',
              'Quer que os clientes marquem sozinhos?',
            ][step]
          }
        </h1>
        <div className="mt-4 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i <= step ? 'bg-system-blue' : 'bg-foreground/[0.08]',
              )}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SEGMENTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setSegment(s.value);
                  setServices(toRows(s.value));
                }}
                className={cn(
                  'rounded-2xl px-4 py-4 text-left text-[15px] font-medium ring-1 transition-colors',
                  segment === s.value
                    ? 'bg-system-blue/[0.08] ring-system-blue ring-2'
                    : 'bg-tile hover:ring-foreground/10 ring-transparent',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {segment && (
            <div className="flex flex-col gap-2">
              <p className="text-label-secondary text-[14px]">
                Serviços sugeridos — ajuste nome, duração e preço. Dá para mudar tudo depois em
                Serviços.
              </p>
              <div className="text-label-secondary grid grid-cols-[24px_1fr_80px_96px] gap-2 px-1 text-[12px]">
                <span />
                <span>Serviço</span>
                <span>Minutos</span>
                <span>Preço (R$)</span>
              </div>
              {services.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid grid-cols-[24px_1fr_80px_96px] items-center gap-2',
                    !s.selected && 'opacity-45',
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Usar ${s.name}`}
                    checked={s.selected}
                    onChange={(e) =>
                      setServices((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, selected: e.target.checked } : r)),
                      )
                    }
                    className="size-4 accent-[var(--system-blue)]"
                  />
                  <Input
                    value={s.name}
                    onChange={(e) =>
                      setServices((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min={5}
                    value={s.duration}
                    onChange={(e) =>
                      setServices((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, duration: e.target.value } : r)),
                      )
                    }
                  />
                  <Input
                    inputMode="decimal"
                    value={s.price}
                    onChange={(e) =>
                      setServices((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setServices((rows) => [
                    ...rows,
                    { name: '', duration: '30', price: '', selected: true },
                  ])
                }
                className="text-system-blue flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
              >
                <PlusIcon className="size-3.5" /> Outro serviço
              </button>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-label-secondary text-[14px]">
            Cada pessoa vira uma coluna na agenda. Se você atende sozinho(a), coloque só o seu nome.
          </p>
          {team.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                autoFocus={i === team.length - 1}
                placeholder={i === 0 ? 'Seu nome' : 'Nome do profissional'}
                value={name}
                onChange={(e) => setTeam((t) => t.map((v, j) => (j === i ? e.target.value : v)))}
              />
              {team.length > 1 && (
                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => setTeam((t) => t.filter((_, j) => j !== i))}
                  className="text-label-secondary p-1"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTeam((t) => [...t, ''])}
            className="text-system-blue flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
          >
            <PlusIcon className="size-3.5" /> Adicionar pessoa
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={weekdays.includes(i)}
                onClick={() =>
                  setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))
                }
                className={cn(
                  'w-14 rounded-full py-2 text-[14px] font-medium',
                  weekdays.includes(i) ? 'bg-foreground text-background' : 'bg-foreground/[0.06]',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[15px]">
            Das{' '}
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-32"
            />{' '}
            às{' '}
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-32"
            />
          </div>
          <p className="text-label-secondary text-[14px]">
            Vale para toda a equipe. Depois, em Profissionais, dá para ajustar o horário de cada um,
            folgas e férias.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[16px] font-semibold">Ligar o agendamento online</div>
              <div className="text-label-secondary text-[14px]">
                Um link para o Instagram e o WhatsApp: o cliente escolhe serviço, profissional e
                horário livre.
              </div>
            </div>
            <Switch checked={online} onCheckedChange={setOnline} aria-label="Agendamento online" />
          </div>
          {online && (
            <code className="bg-background truncate rounded-xl px-3 py-2 text-[13px]">
              {bookingUrl}
            </code>
          )}
          <ul className="text-label-secondary flex flex-col gap-1 text-[14px]">
            <li className="flex items-center gap-2">
              <CheckIcon className="text-system-green size-4" /> {chosen.length} serviços
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="text-system-green size-4" /> {people.length}{' '}
              {people.length === 1 ? 'pessoa' : 'pessoas'} na agenda
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="text-system-green size-4" />{' '}
              {weekdays.map((d) => WEEKDAYS[d]).join(', ')}, {startTime}–{endTime}
            </li>
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            Voltar
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            Configurar depois
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continuar
          </Button>
        ) : (
          <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
            {finish.isPending ? 'Preparando sua agenda...' : 'Concluir e abrir a agenda'}
          </Button>
        )}
      </div>
    </div>
  );
}
