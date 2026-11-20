'use client';

import * as React from 'react';
import { CheckIcon, PlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DemoPlayer,
  MiniButton,
  MiniField,
  MiniSwitch,
  MiniToast,
  Pop,
  Typed,
  type DemoStep,
} from '@/components/tutorial/demo/demo-player';

/* Profissionais e Serviços em miniatura (dados fictícios). */

// ── Expediente ──────────────────────────────────────────────────────────────

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function TimeBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-background border-foreground/15 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums">
      {children}
    </span>
  );
}

const SCHEDULE_STEPS: DemoStep[] = [
  {
    caption:
      'Profissional sem expediente: a tela sugere seg a sex, 9h às 18h, mas ainda não salvou. Enquanto isso, ele não aparece no link.',
    target: 'lunch',
    duration: 4200,
  },
  {
    caption: 'Intervalo de almoço divide o dia em dois. Cada mudança já é salva sozinha.',
    target: 'copy',
    duration: 3200,
  },
  { caption: 'Copiar segunda para ter–sex repete o dia na semana.', target: 'saturday' },
  {
    caption:
      'Ligue o sábado e ajuste o horário. Fora do expediente a agenda fica cinza e o link não oferece horário.',
    duration: 4600,
  },
];

export function ScheduleDemo() {
  return (
    <DemoPlayer title="Definir o expediente" steps={SCHEDULE_STEPS} height={330}>
      {(step) => {
        const split = (day: number) => step >= 2 || (step >= 1 && day === 0);
        return (
          <div className="flex h-full flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold">Expediente · Ana Paula</p>
                <p className="text-label-secondary text-[11px]">
                  Fora destes horários a agenda fica cinza.
                </p>
              </div>
              <MiniButton demo="copy" tone="ghost">
                Copiar segunda para ter–sex
              </MiniButton>
            </div>
            {step === 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-[#ff9f0a]/12 px-3 py-1.5 text-[11px] text-[#8a4b00] dark:text-[#ffb340]">
                <span className="flex-1">
                  <strong>Sugestão, ainda não salva.</strong> Não aparece no link até salvar.
                </span>
                <MiniButton className="h-6 text-[11px]">
                  <CheckIcon className="size-3" /> Salvar este expediente
                </MiniButton>
              </div>
            )}
            <div className="ring-foreground/[0.08] divide-foreground/[0.06] flex flex-col divide-y rounded-xl ring-1">
              {DAYS.map((d, i) => {
                const weekend = i >= 5;
                const works = !weekend || (i === 5 && step >= 3);
                return (
                  <div key={d} className="flex h-[27px] items-center gap-2 px-2.5 text-[11px]">
                    <MiniSwitch on={works} demo={i === 5 ? 'saturday' : undefined} />
                    <span className="w-14 font-medium">{d}</span>
                    {!works ? (
                      <span className="text-label-secondary">Folga</span>
                    ) : i === 5 ? (
                      <>
                        <TimeBox>09:00</TimeBox> às{' '}
                        <TimeBox>
                          <Typed text="13:00" delay={600} />
                        </TimeBox>
                      </>
                    ) : split(i) ? (
                      <>
                        <TimeBox>09:00</TimeBox> às <TimeBox>12:00</TimeBox>
                        <span className="text-label-secondary">e</span>
                        <TimeBox>13:00</TimeBox> às <TimeBox>18:00</TimeBox>
                      </>
                    ) : (
                      <>
                        <TimeBox>09:00</TimeBox> às <TimeBox>18:00</TimeBox>
                        <span
                          data-demo={i === 0 ? 'lunch' : undefined}
                          className="text-system-blue flex items-center gap-0.5"
                        >
                          <PlusIcon className="size-3" /> Intervalo de almoço
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p
              className={cn(
                'flex items-center gap-1 text-[11px]',
                step === 0 ? 'text-label-secondary' : 'text-system-green',
              )}
            >
              {step === 0 ? (
                'As mudanças são salvas automaticamente.'
              ) : (
                <>
                  <CheckIcon className="size-3.5" /> Expediente salvo — o link público já usa estes
                  horários.
                </>
              )}
            </p>
          </div>
        );
      }}
    </DemoPlayer>
  );
}

// ── Pacote ──────────────────────────────────────────────────────────────────

const PACKAGE_STEPS: DemoStep[] = [
  {
    caption:
      'Em Serviços › Pacotes › Novo pacote: nome, serviço, sessões e preço. A tela mostra quanto sai cada sessão.',
    target: 'save-pkg',
    duration: 4600,
  },
  {
    caption: 'Vendido o pacote, no atendimento abra a comanda e toque em Usar.',
    target: 'use',
  },
  {
    caption: (
      <>
        O botão vira <strong>Concluir sessão</strong>: o cliente não paga de novo.
      </>
    ),
    target: 'conclude',
  },
  {
    caption: 'A sessão sai do pacote. No Financeiro, o pacote entrou uma vez só, no dia da venda.',
    duration: 4200,
  },
];

export function PackageDemo() {
  return (
    <DemoPlayer title="Criar e usar um pacote" steps={PACKAGE_STEPS} height={262}>
      {(step) => (
        <div className="relative flex h-full flex-col gap-3 p-4">
          {step === 0 ? (
            <Pop className="flex flex-col gap-2">
              <p className="text-[15px] font-bold">Novo pacote</p>
              <MiniField label="Nome" focused>
                <Typed text="4 limpezas de pele" />
              </MiniField>
              <div className="grid grid-cols-3 gap-2">
                <MiniField label="Serviço">Limpeza de pele</MiniField>
                <MiniField label="Sessões">4</MiniField>
                <MiniField label="Preço do pacote">R$ 320,00</MiniField>
              </div>
              <p className="bg-system-green/10 rounded-lg px-2.5 py-1.5 text-[11px]">
                <strong>R$ 80,00 por sessão</strong> · avulso seriam R$ 400,00 (o cliente economiza
                R$ 80,00)
              </p>
              <MiniButton demo="save-pkg" className="self-end">
                Salvar pacote
              </MiniButton>
            </Pop>
          ) : (
            <Pop className="flex flex-col gap-2">
              <p className="text-[15px] font-bold">Comanda · Maria Souza</p>
              <div className="flex justify-between text-[12px]">
                <span>Limpeza de pele</span>
                <span className={cn(step >= 2 && 'text-label-secondary line-through')}>
                  R$ 100,00
                </span>
              </div>
              <span
                data-demo="use"
                className={cn(
                  'self-start rounded-full border px-3 py-1 text-[11px]',
                  step >= 2
                    ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                    : 'border-foreground/15',
                )}
              >
                {step >= 2 ? '✓ ' : ''}Usar 4 limpezas de pele · sessão 2 de 4
              </span>
              <div className="border-foreground/10 flex justify-between border-t pt-2 text-[13px] font-bold">
                <span>Total</span>
                <span>{step >= 2 ? 'R$ 0,00' : 'R$ 100,00'}</span>
              </div>
              <MiniButton
                demo="conclude"
                tone={step >= 2 ? 'green' : 'primary'}
                className="justify-center"
              >
                {step >= 2 ? 'Concluir sessão' : 'Concluir e cobrar'}
              </MiniButton>
            </Pop>
          )}
          {step >= 3 && (
            <MiniToast>
              <CheckIcon className="text-system-green size-4" /> Sessão 2 de 4 usada · restam 2
            </MiniToast>
          )}
        </div>
      )}
    </DemoPlayer>
  );
}
