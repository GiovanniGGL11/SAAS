'use client';

import * as React from 'react';
import { AlertTriangleIcon, CheckIcon, PlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooth } from '@/components/prontuario/odontogram-tab';
import { FaceDrawing } from '@/components/prontuario/face-map-tab';
import { FACE_VIEWBOX, areaAt } from '@/lib/face-map';
import { TOOTH_CONDITIONS, TOOTH_FACES, FACE_LABEL } from '@/lib/odontogram';
import {
  DemoPlayer,
  MiniButton,
  MiniField,
  MiniToast,
  Pop,
  Typed,
  type DemoStep,
} from '@/components/tutorial/demo/demo-player';

/* Prontuário em miniatura (paciente fictício). */

function PatientHeader({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-tile flex items-center gap-3 rounded-2xl p-3">
        <span className="bg-system-blue/12 text-system-blue flex size-9 items-center justify-center rounded-full text-[14px] font-bold">
          M
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-bold">Maria Souza</p>
          <p className="text-label-secondary text-[11px]">34 anos · Paciente desde 2025</p>
        </div>
        <span className="bg-system-red/[0.08] flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]">
          <AlertTriangleIcon className="text-system-red size-3.5" />
          <strong>Alergias:</strong> Dipirona
        </span>
      </div>
      <div className="bg-foreground/[0.06] flex self-start rounded-full p-0.5 text-[11px]">
        {['Evolução', 'Odontograma', 'Mapa facial', 'Plano de tratamento'].map((t) => (
          <span
            key={t}
            className={cn(
              'rounded-full px-2.5 py-0.5',
              t === tab && 'bg-background font-semibold shadow-sm',
            )}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Evolução ────────────────────────────────────────────────────────────────

const NOTE_STEPS: DemoStep[] = [
  {
    caption: 'Na Evolução, escolha um modelo de texto do seu ramo (ou escreva livre).',
    target: 'template',
  },
  {
    caption:
      'Complete o texto. Fez uma sessão do plano de tratamento? Marque ali mesmo, na caixinha.',
    target: 'session',
    duration: 3600,
  },
  { caption: 'Salve a evolução.', target: 'save-note', duration: 2400 },
  {
    caption: (
      <>
        Fica no histórico com o nome e a hora, e o plano anda sozinho. A evolução não se apaga: para
        corrigir, use <strong>Retificar</strong>.
      </>
    ),
    duration: 4200,
  },
];

export function EvolutionDemo() {
  return (
    <DemoPlayer title="Registrar a evolução" steps={NOTE_STEPS} height={330}>
      {(step) => (
        <div className="relative flex h-full flex-col gap-3 p-3">
          <PatientHeader tab="Evolução" />
          {step < 3 ? (
            <div className="bg-tile flex flex-col gap-2 rounded-2xl p-3">
              <div className="flex gap-1.5">
                {['Atendimento odontológico', 'Evolução geral'].map((t, i) => (
                  <span
                    key={t}
                    data-demo={i === 0 ? 'template' : undefined}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px]',
                      i === 0 && step >= 1
                        ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                        : 'border-foreground/15',
                    )}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="bg-background border-foreground/15 h-[92px] rounded-lg border p-2 text-[11px] leading-snug whitespace-pre-line">
                {step === 0 ? (
                  <span className="text-label-secondary">Como foi o atendimento?</span>
                ) : (
                  <>
                    {'Queixa principal: sensibilidade no 36\nProcedimento realizado: '}
                    {step === 1 ? (
                      <Typed text="clareamento, 2ª sessão" delay={400} />
                    ) : (
                      'clareamento, 2ª sessão'
                    )}
                    {'\nPróxima etapa do tratamento: 3ª sessão em 15 dias'}
                  </>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span data-demo="session" className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded border',
                      step >= 2 ? 'bg-system-blue border-system-blue' : 'border-foreground/30',
                    )}
                  >
                    {step >= 2 && <CheckIcon className="size-3 text-white" />}
                  </span>
                  Clareamento · sessão 2 de 3
                </span>
                <MiniButton demo="save-note">Salvar evolução</MiniButton>
              </div>
            </div>
          ) : (
            <Pop className="flex flex-col gap-2">
              <div className="bg-tile rounded-2xl p-3 text-[11px] leading-snug">
                <p className="text-label-secondary mb-1">Hoje, 10:42 · Dra. Ana</p>
                Queixa principal: sensibilidade no 36 · Procedimento realizado: clareamento, 2ª
                sessão · Próxima etapa do tratamento: 3ª sessão em 15 dias
              </div>
              <div className="bg-tile flex items-center gap-2 rounded-2xl p-3 text-[11px]">
                <span className="font-semibold">Plano de tratamento</span>
                <span className="flex-1">Clareamento</span>
                <span className="bg-foreground/10 h-1.5 w-24 overflow-hidden rounded-full">
                  <span className="bg-system-blue block h-full w-2/3" />
                </span>
                <span className="tabular-nums">2 de 3</span>
              </div>
              <MiniToast>
                <CheckIcon className="text-system-green size-4" /> Evolução salva
              </MiniToast>
            </Pop>
          )}
        </div>
      )}
    </DemoPlayer>
  );
}

// ── Odontograma ─────────────────────────────────────────────────────────────

const TEETH = [45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37];
/** Uma coroa já existente no 42, para mostrar a marcação do dente inteiro. */
const CROWN = [{ faces: [] as string[], condition: 'coroa', status: 'done' }];

const TOOTH_STEPS: DemoStep[] = [
  { caption: 'No Odontograma, clique no dente.', target: 'tooth-36' },
  {
    caption: 'Escolha o que há no dente: cárie, restauração, canal, coroa, implante...',
    target: 'cond-carie',
  },
  { caption: 'Marque as faces. O é a oclusal (a de mastigar).', target: 'face-O' },
  {
    caption: (
      <>
        Deixe em <strong>A fazer</strong> e clique em Marcar.
      </>
    ),
    target: 'mark',
    duration: 2400,
  },
  {
    caption: (
      <>
        Fica <strong className="text-system-red">vermelho</strong>: está a fazer. Quando fizer,
        toque em <strong>Feito</strong>.
      </>
    ),
    target: 'done',
    duration: 3400,
  },
  {
    caption: (
      <>
        Fica <strong className="text-system-blue">azul</strong>: feito ou já existente. Nada se
        apaga: o histórico guarda quem marcou e quando.
      </>
    ),
    duration: 4200,
  },
];

export function OdontogramDemo() {
  return (
    <DemoPlayer title="Marcar no odontograma" steps={TOOTH_STEPS} height={364}>
      {(step) => {
        const marks36 =
          step >= 4
            ? [{ faces: ['O'], condition: 'carie', status: step >= 5 ? 'done' : 'planned' }]
            : [];
        return (
          <div className="relative flex h-full flex-col gap-3 p-3">
            <PatientHeader tab="Odontograma" />
            <div className="bg-tile flex flex-col items-center gap-1 rounded-2xl p-3">
              <div className="flex gap-0.5">
                {TEETH.map((t, i) => (
                  <React.Fragment key={t}>
                    {i === 5 && <span className="bg-foreground/15 mx-1 w-px self-stretch" />}
                    <span data-demo={`tooth-${t}`}>
                      <Tooth
                        tooth={t}
                        marks={t === 36 ? marks36 : t === 42 ? CROWN : []}
                        selected={t === 36 && step >= 1}
                        onSelect={() => undefined}
                      />
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {step >= 1 && step <= 3 && (
              <Pop className="bg-tile flex flex-col gap-2 rounded-2xl p-3">
                <p className="text-[12px] font-semibold">Dente 36 · 1º molar inferior esquerdo</p>
                <div className="flex flex-wrap gap-1">
                  {TOOTH_CONDITIONS.slice(0, 7).map((c) => (
                    <span
                      key={c.key}
                      data-demo={`cond-${c.key}`}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px]',
                        step >= 2 && c.key === 'carie'
                          ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                          : 'border-foreground/15',
                      )}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
                {step >= 2 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {TOOTH_FACES.map((f) => (
                      <span
                        key={f}
                        data-demo={`face-${f}`}
                        title={FACE_LABEL[f]}
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10px]',
                          step >= 3 && f === 'O'
                            ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                            : 'border-foreground/15',
                        )}
                      >
                        {f}
                      </span>
                    ))}
                    <span className="bg-foreground/[0.06] ml-2 flex rounded-full p-0.5 text-[10px]">
                      <span className="bg-background rounded-full px-2 font-semibold shadow-sm">
                        A fazer
                      </span>
                      <span className="px-2">Feito / existente</span>
                    </span>
                    <MiniButton demo="mark" className="ml-auto h-6">
                      <PlusIcon className="size-3" /> Marcar
                    </MiniButton>
                  </div>
                )}
              </Pop>
            )}
            {step >= 4 && (
              <Pop className="bg-tile flex items-center gap-2 rounded-2xl p-3 text-[12px]">
                <span
                  className={cn(
                    'size-2.5 rounded-full',
                    step >= 5 ? 'bg-system-blue' : 'bg-system-red',
                  )}
                />
                <span className="flex-1">
                  <strong>36 · Cárie (O)</strong> · {step >= 5 ? 'Feito' : 'A fazer'} · Dra. Ana
                </span>
                {step === 4 && (
                  <MiniButton demo="done" tone="outline" className="h-6">
                    <CheckIcon className="size-3" /> Feito
                  </MiniButton>
                )}
              </Pop>
            )}
          </div>
        );
      }}
    </DemoPlayer>
  );
}

// ── Mapa facial ─────────────────────────────────────────────────────────────

const SPOTS = [
  { x: 38, y: 18 },
  { x: 62, y: 18 },
  { x: 50, y: 32 },
];
const FACE_W = 170;
const FACE_H = (FACE_W * FACE_VIEWBOX.height) / FACE_VIEWBOX.width;

const FACE_STEPS: DemoStep[] = [
  { caption: 'Em Nova aplicação, escreva o procedimento.', target: 'title', duration: 3000 },
  { caption: 'Clique no rosto para marcar o ponto. A região aparece sozinha.', target: 'spot-0' },
  {
    caption: 'Informe o produto e a quantidade. O próximo ponto repete os dois.',
    target: 'spot-1',
    duration: 3600,
  },
  { caption: 'Marque os outros pontos.', target: 'spot-2' },
  { caption: 'O total por produto é somado. Salve a aplicação.', target: 'save-map' },
  {
    caption: (
      <>
        Fica no prontuário, com o desenho. No retoque, <strong>Repetir os pontos da última</strong>{' '}
        poupa tempo.
      </>
    ),
    duration: 4200,
  },
];

export function FaceMapDemo() {
  return (
    <DemoPlayer title="Registrar no mapa facial" steps={FACE_STEPS} height={330}>
      {(step) => {
        const count = step <= 1 ? 0 : step === 2 ? 1 : step === 3 ? 2 : 3;
        const points = SPOTS.slice(0, count);
        return (
          <div className="relative flex h-full gap-3 p-3">
            <div className="relative shrink-0" style={{ width: FACE_W, height: FACE_H }}>
              <FaceDrawing points={points} selected={count - 1} className="size-full" />
              {SPOTS.map((s, i) => (
                <span
                  key={i}
                  data-demo={`spot-${i}`}
                  className="absolute size-2"
                  style={{ left: `calc(${s.x}% - 4px)`, top: `calc(${s.y}% - 4px)` }}
                />
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <MiniField label="Procedimento" demo="title" focused={step === 0}>
                {step === 0 ? <Typed text="Toxina botulínica" /> : 'Toxina botulínica'}
              </MiniField>
              {points.map((p, i) => (
                <Pop
                  key={i}
                  className="bg-tile grid grid-cols-[18px_1fr_1fr_44px] items-center gap-1.5 rounded-lg p-1.5 text-[11px]"
                >
                  <span className="text-center font-bold">{i + 1}</span>
                  <span className="bg-background border-foreground/15 truncate rounded border px-1.5 py-1">
                    {areaAt(p.x, p.y)}
                  </span>
                  <span className="bg-background border-foreground/15 rounded border px-1.5 py-1">
                    {i === 0 && step === 2 ? <Typed text="Toxina A" delay={500} /> : 'Toxina A'}
                  </span>
                  <span className="bg-background border-foreground/15 rounded border px-1.5 py-1">
                    4 U
                  </span>
                </Pop>
              ))}
              {count === 0 && (
                <p className="text-label-secondary text-[11px]">
                  Nenhum ponto ainda. Clique no rosto.
                </p>
              )}
              {count > 0 && (
                <p className="text-[12px]">
                  <span className="text-label-secondary">Total: </span>
                  <strong>Toxina A</strong> {count * 4} U
                </p>
              )}
              <div className="mt-auto flex justify-end">
                <MiniButton demo="save-map">Salvar aplicação</MiniButton>
              </div>
            </div>
            {step >= 5 && (
              <MiniToast>
                <CheckIcon className="text-system-green size-4" /> Aplicação registrada no
                prontuário
              </MiniToast>
            )}
          </div>
        );
      }}
    </DemoPlayer>
  );
}
