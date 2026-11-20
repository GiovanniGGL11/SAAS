'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, HistoryIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Surface } from '@/components/layout/page';
import { unwrapResult } from '@/lib/action-result';
import {
  FACE_LABEL,
  LOWER_DECIDUOUS,
  LOWER_PERMANENT,
  STATUS_LABEL,
  TOOTH_CONDITIONS,
  TOOTH_FACES,
  UPPER_DECIDUOUS,
  UPPER_PERMANENT,
  conditionOf,
  describeToothMark,
  faceLayout,
  toothName,
  type ToothFace,
  type ToothStatus,
} from '@/lib/odontogram';
import { cn } from '@/lib/utils';
import {
  addToothMarkAction,
  listToothMarksAction,
  markToothDoneAction,
  removeToothMarkAction,
} from '@/server/actions/medical-record-actions';

type Mark = {
  id: string;
  tooth: number;
  faces: string[];
  condition: string;
  status: string;
  note: string | null;
  authorName: string;
  createdAt: Date | string;
  doneAt: Date | string | null;
  doneByName: string | null;
  removedAt: Date | string | null;
  removedByName: string | null;
};

const COLOR: Record<string, string> = {
  planned: 'fill-system-red',
  done: 'fill-system-blue',
};
const STROKE: Record<string, string> = {
  planned: 'stroke-system-red',
  done: 'stroke-system-blue',
};

/** Desenho de um dente: 5 faces (a do meio é a oclusal) e, por cima, o que vale para o dente todo. */
export function Tooth({
  tooth,
  marks,
  selected,
  onSelect,
}: {
  tooth: number;
  marks: Pick<Mark, 'faces' | 'condition' | 'status'>[];
  selected: boolean;
  onSelect: () => void;
}) {
  const layout = faceLayout(tooth);
  // A marcação mais recente de cada face decide a cor (a lista já vem da mais nova).
  const faceStatus = (face: ToothFace) => marks.find((m) => m.faces.includes(face))?.status;
  const whole = marks.find((m) => conditionOf(m.condition)?.scope === 'tooth');
  const crossed = whole && (whole.condition === 'ausente' || whole.condition === 'extracao');
  const region = (face: ToothFace) =>
    cn('stroke-foreground/30 fill-background', faceStatus(face) && COLOR[faceStatus(face)!]);
  const upper = UPPER_PERMANENT.includes(tooth) || UPPER_DECIDUOUS.includes(tooth);
  const label = (
    <span
      className={cn('text-[11px] tabular-nums', selected ? 'font-bold' : 'text-label-secondary')}
    >
      {tooth}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Dente ${tooth}, ${toothName(tooth)}`}
      aria-pressed={selected}
      className={cn(
        'flex w-9 shrink-0 flex-col items-center gap-0.5 rounded-lg p-0.5 transition-colors',
        selected ? 'bg-system-blue/12' : 'hover:bg-foreground/[0.05]',
      )}
    >
      {upper && label}
      <svg viewBox="0 0 40 40" className="size-8" aria-hidden>
        <polygon points="0,0 40,0 27,13 13,13" className={region(layout.top)} />
        <polygon points="0,40 40,40 27,27 13,27" className={region(layout.bottom)} />
        <polygon points="0,0 13,13 13,27 0,40" className={region(layout.left)} />
        <polygon points="40,0 27,13 27,27 40,40" className={region(layout.right)} />
        <rect x="13" y="13" width="14" height="14" className={region('O')} />
        {whole && !crossed && (
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="4"
            className={cn('fill-none', STROKE[whole.status])}
            strokeWidth="3"
          />
        )}
        {crossed && (
          <g className={STROKE[whole.status]} strokeWidth="4" strokeLinecap="round">
            <line x1="4" y1="4" x2="36" y2="36" />
            <line x1="36" y1="4" x2="4" y2="36" />
          </g>
        )}
      </svg>
      <span
        className={cn(
          'h-3 text-[9px] leading-3 font-bold',
          whole?.status === 'planned' ? 'text-system-red' : 'text-system-blue',
        )}
      >
        {whole ? conditionOf(whole.condition)?.short : ''}
      </span>
      {!upper && label}
    </button>
  );
}

function Arch({
  teeth,
  marksOf,
  selected,
  onSelect,
}: {
  teeth: number[];
  marksOf: (tooth: number) => Mark[];
  selected: number | null;
  onSelect: (tooth: number) => void;
}) {
  const half = teeth.length / 2;
  return (
    <div className="flex justify-center gap-0.5">
      {teeth.map((t, i) => (
        <React.Fragment key={t}>
          {i === half && <span className="bg-foreground/15 mx-1 w-px self-stretch" aria-hidden />}
          <Tooth
            tooth={t}
            marks={marksOf(t)}
            selected={selected === t}
            onSelect={() => onSelect(t)}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Odontograma: clique no dente, escolha o que há (cárie, restauração, canal...), as faces e se
 * está a fazer (vermelho) ou feito / já existente (azul). Nada se apaga: "remover" vai para o
 * histórico.
 */
export function OdontogramTab({
  clientId,
  when,
}: {
  clientId: string;
  when: (d: Date | string) => string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['tooth-marks', clientId];
  const { data: marks } = useQuery({
    queryKey,
    queryFn: () => listToothMarksAction(clientId).then(unwrapResult) as Promise<Mark[]>,
  });
  const [dentition, setDentition] = React.useState<'permanent' | 'deciduous' | null>(null);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [condition, setCondition] = React.useState('carie');
  const [faces, setFaces] = React.useState<ToothFace[]>([]);
  const [status, setStatus] = React.useState<ToothStatus>('planned');
  const [note, setNote] = React.useState('');
  const [removing, setRemoving] = React.useState<Mark | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: () =>
      addToothMarkAction({
        clientId,
        tooth: selected,
        faces,
        condition,
        status,
        note: note || null,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Marcado no odontograma.');
      setFaces([]);
      setNote('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const done = useMutation({
    mutationFn: (id: string) => markToothDoneAction({ clientId, id }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Marcado como feito.');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeToothMarkAction({ clientId, id }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Removido do odontograma. Continua no histórico.');
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!marks) return <Skeleton className="h-[320px] rounded-[22px]" />;

  const active = marks.filter((m) => !m.removedAt);
  const marksOf = (tooth: number) => active.filter((m) => m.tooth === tooth);
  // Começa nos dentes de leite só quando é ali que estão as marcações.
  const onlyDeciduous = active.length > 0 && active.every((m) => Math.floor(m.tooth / 10) >= 5);
  const view = dentition ?? (onlyDeciduous ? 'deciduous' : 'permanent');
  const planned = active.filter((m) => m.status === 'planned');
  const chosen = conditionOf(condition)!;

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            value={view}
            onValueChange={(v) => {
              setDentition(v);
              setSelected(null);
            }}
            options={[
              { value: 'permanent', label: 'Permanentes' },
              { value: 'deciduous', label: 'De leite' },
            ]}
          />
          <div className="text-label-secondary flex items-center gap-3 text-[12px]">
            <span className="flex items-center gap-1">
              <span className="bg-system-red size-3 rounded-sm" /> A fazer
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-system-blue size-3 rounded-sm" /> Feito / existente
            </span>
          </div>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max flex-col gap-3">
            <Arch
              teeth={view === 'permanent' ? UPPER_PERMANENT : UPPER_DECIDUOUS}
              marksOf={marksOf}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="bg-foreground/15 h-px" aria-hidden />
            <Arch
              teeth={view === 'permanent' ? LOWER_PERMANENT : LOWER_DECIDUOUS}
              marksOf={marksOf}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>
        {selected === null && (
          <p className="text-label-secondary text-center text-[12px]">
            Clique num dente para marcar. A direita do paciente fica à esquerda do desenho.
          </p>
        )}
      </Surface>

      {selected !== null && (
        <Surface className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="text-[15px] font-semibold">
              Dente {selected} · {toothName(selected)}
            </h3>
          </div>

          {marksOf(selected).length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {marksOf(selected).map((m) => (
                <li
                  key={m.id}
                  className="bg-foreground/[0.03] flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px]"
                >
                  <span
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      m.status === 'planned' ? 'bg-system-red' : 'bg-system-blue',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <strong>{conditionOf(m.condition)?.label ?? m.condition}</strong>
                    {m.faces.length ? ` (${m.faces.join(', ')})` : ''} ·{' '}
                    {STATUS_LABEL[m.status as ToothStatus]}
                    {m.note ? ` · ${m.note}` : ''}
                    <span className="text-label-secondary">
                      {' '}
                      · {m.authorName}, {when(m.createdAt)}
                    </span>
                  </span>
                  {m.status === 'planned' && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={done.isPending}
                      onClick={() => done.mutate(m.id)}
                    >
                      <CheckIcon /> Feito
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label="Remover marcação"
                    onClick={() => setRemoving(m)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {TOOTH_CONDITIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCondition(c.key)}
                  aria-pressed={condition === c.key}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px] transition-colors',
                    condition === c.key
                      ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                      : 'border-foreground/15 hover:bg-foreground/[0.04]',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {chosen.scope === 'faces' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-label-secondary text-[12px]">Faces:</span>
                {TOOTH_FACES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    title={FACE_LABEL[f]}
                    aria-pressed={faces.includes(f)}
                    onClick={() =>
                      setFaces((prev) =>
                        prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
                      )
                    }
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
                      faces.includes(f)
                        ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                        : 'border-foreground/15 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {f} <span className="text-label-secondary font-normal">{FACE_LABEL[f]}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                value={status}
                onValueChange={setStatus}
                options={[
                  { value: 'planned', label: 'A fazer' },
                  { value: 'done', label: 'Feito / existente' },
                ]}
              />
              <Input
                className="min-w-[180px] flex-1"
                placeholder="Observação (opcional)"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                disabled={add.isPending || (chosen.scope === 'faces' && faces.length === 0)}
              >
                <PlusIcon /> {add.isPending ? 'Salvando...' : 'Marcar'}
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {planned.length > 0 && (
        <Surface className="flex flex-col gap-2 p-4">
          <h3 className="text-[14px] font-semibold">A fazer ({planned.length})</h3>
          <ul className="flex flex-col gap-1 text-[13px]">
            {[...planned]
              .sort((a, b) => a.tooth - b.tooth)
              .map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      setDentition(Math.floor(m.tooth / 10) >= 5 ? 'deciduous' : 'permanent');
                      setSelected(m.tooth);
                    }}
                  >
                    {describeToothMark(m)}
                    {m.note ? ` · ${m.note}` : ''}
                  </button>
                </li>
              ))}
          </ul>
        </Surface>
      )}

      {marks.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
            <HistoryIcon /> {showHistory ? 'Esconder histórico' : 'Ver histórico do odontograma'}
          </Button>
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-1 text-[12px]">
              {marks.map((m) => (
                <li key={m.id} className={cn(m.removedAt && 'text-label-secondary line-through')}>
                  {when(m.createdAt)} · {describeToothMark(m)} · {m.authorName}
                  {m.doneAt && m.doneByName
                    ? ` · feito por ${m.doneByName}, ${when(m.doneAt)}`
                    : ''}
                  {m.removedAt
                    ? ` · removido por ${m.removedByName ?? 'equipe'}, ${when(m.removedAt)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remover do odontograma?"
        description="A marcação sai do desenho, mas continua no histórico com o seu nome e a data."
        confirmLabel="Remover"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </div>
  );
}
