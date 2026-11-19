'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/layout/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import {
  FACE_MAP_MAX_POINTS,
  FACE_UNITS,
  FACE_UNIT_LABEL,
  FACE_VIEWBOX,
  areaAt,
  faceMapTotals,
  formatAmount,
  type FacePoint,
  type FaceUnit,
} from '@/lib/face-map';
import { cn } from '@/lib/utils';
import {
  cancelFaceMapAction,
  createFaceMapAction,
  listFaceMapsAction,
} from '@/server/actions/medical-record-actions';

const PROCEDURES = [
  'Toxina botulínica',
  'Preenchimento com ácido hialurônico',
  'Bioestimulador de colágeno',
  'Fios de PDO',
  'Skinbooster',
  'Enzima / lipo de papada',
  'Microagulhamento',
];

type DraftPoint = Omit<FacePoint, 'amount'> & { amount: string };

/**
 * Desenho do rosto (de frente). Os pontos ficam em % da largura e da altura, e as regiões de
 * src/lib/face-map.ts (areaAt) seguem este desenho.
 */
function FaceDrawing({
  points,
  selected,
  onAdd,
  onSelect,
  className,
}: {
  points: Pick<FacePoint, 'x' | 'y'>[];
  selected?: number | null;
  onAdd?: (x: number, y: number) => void;
  onSelect?: (index: number) => void;
  className?: string;
}) {
  const { width: W, height: H } = FACE_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('select-none', onAdd && 'cursor-crosshair', className)}
      role={onAdd ? 'button' : 'img'}
      aria-label={onAdd ? 'Rosto: clique para marcar um ponto' : 'Rosto com os pontos aplicados'}
      onClick={(e) => {
        if (!onAdd) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onAdd(
          ((e.clientX - rect.left) / rect.width) * 100,
          ((e.clientY - rect.top) / rect.height) * 100,
        );
      }}
    >
      <g className="stroke-foreground/35 fill-none" strokeWidth="1.5" strokeLinecap="round">
        <ellipse cx="100" cy="135" rx="74" ry="105" className="fill-foreground/[0.03]" />
        <ellipse cx="24" cy="120" rx="7" ry="20" />
        <ellipse cx="176" cy="120" rx="7" ry="20" />
        <path d="M58 88 Q72 80 88 85" />
        <path d="M112 85 Q128 80 142 88" />
        <ellipse cx="74" cy="104" rx="13" ry="5.5" />
        <ellipse cx="126" cy="104" rx="13" ry="5.5" />
        <path d="M97 98 L94 140" />
        <path d="M88 147 Q100 157 112 147" />
        <path d="M84 154 Q76 170 80 184" className="stroke-foreground/20" />
        <path d="M116 154 Q124 170 120 184" className="stroke-foreground/20" />
        <path d="M78 187 Q90 179 100 184 Q110 179 122 187 Q100 193 78 187 Z" />
        <path d="M78 187 Q100 205 122 187" />
        <path d="M88 228 Q100 234 112 228" className="stroke-foreground/20" />
      </g>
      {points.map((p, i) => {
        const cx = (p.x / 100) * W;
        const cy = (p.y / 100) * H;
        return (
          <g
            key={i}
            onClick={(e) => {
              if (!onSelect) return;
              e.stopPropagation();
              onSelect(i);
            }}
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            <circle
              cx={cx}
              cy={cy}
              r="6.5"
              className={cn(
                'stroke-background',
                selected === i ? 'fill-system-blue' : 'fill-system-red',
              )}
              strokeWidth="1.5"
            />
            <text
              x={cx}
              y={cy + 2.6}
              textAnchor="middle"
              className="fill-white text-[7.5px] font-bold"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Totals({ points }: { points: Pick<FacePoint, 'product' | 'amount' | 'unit'>[] }) {
  const totals = faceMapTotals(points);
  if (!totals.length) return null;
  return (
    <p className="text-[13px]">
      <span className="text-label-secondary">Total: </span>
      {totals.map((t, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <strong>{t.product}</strong> {formatAmount(t.amount, t.unit)}
        </span>
      ))}
    </p>
  );
}

const toDraft = (p: FacePoint): DraftPoint => ({
  ...p,
  amount: p.amount === null ? '' : String(p.amount).replace('.', ','),
});
const parseAmount = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

/**
 * Mapa facial: cada aplicação guarda os pontos marcados no rosto, com produto e quantidade. Não se
 * edita depois; errou? Anule com o motivo e registre de novo.
 */
export function FaceMapTab({
  clientId,
  when,
}: {
  clientId: string;
  when: (d: Date | string) => string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['face-maps', clientId];
  const { data: maps } = useQuery({
    queryKey,
    queryFn: () => listFaceMapsAction(clientId).then(unwrapResult),
  });
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [points, setPoints] = React.useState<DraftPoint[]>([]);
  const [notes, setNotes] = React.useState('');
  const [selected, setSelected] = React.useState<number | null>(null);
  const [canceling, setCanceling] = React.useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = React.useState('');

  const reset = () => {
    setEditing(false);
    setTitle('');
    setPoints([]);
    setNotes('');
    setSelected(null);
  };
  const save = useMutation({
    mutationFn: () =>
      createFaceMapAction({
        clientId,
        title,
        notes: notes || null,
        points: points.map((p) => ({ ...p, amount: parseAmount(p.amount) })),
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Aplicação registrada no prontuário.');
      reset();
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () =>
      cancelFaceMapAction({ clientId, id: canceling!.id, reason }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Aplicação anulada.');
      setCanceling(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!maps) return <Skeleton className="h-[320px] rounded-[22px]" />;
  const lastValid = maps.find((m) => !m.canceledAt);

  const addPoint = (x: number, y: number) => {
    if (points.length >= FACE_MAP_MAX_POINTS) {
      toast.error(`No máximo ${FACE_MAP_MAX_POINTS} pontos por aplicação.`);
      return;
    }
    // O ponto novo repete produto, quantidade e unidade do anterior (o comum é ser o mesmo).
    const prev = points[points.length - 1];
    const point: DraftPoint = {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      area: areaAt(x, y),
      product: prev?.product ?? '',
      amount: prev?.amount ?? '',
      unit: prev?.unit ?? 'U',
      note: null,
    };
    setPoints([...points, point]);
    setSelected(points.length);
  };
  const update = (i: number, patch: Partial<DraftPoint>) =>
    setPoints(points.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="flex flex-col gap-4">
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            <PlusIcon /> Nova aplicação
          </Button>
          {lastValid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTitle(lastValid.title);
                setPoints(lastValid.points.map(toDraft));
                setEditing(true);
              }}
            >
              <CopyIcon /> Repetir os pontos da última
            </Button>
          )}
        </div>
      ) : (
        <Surface className="flex flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-col gap-1.5">
            <Input
              placeholder="Procedimento (ex.: Toxina botulínica)"
              value={title}
              maxLength={100}
              list="face-map-procedures"
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Procedimento"
            />
            <datalist id="face-map-procedures">
              {PROCEDURES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
            <div className="flex flex-col items-center gap-1">
              <FaceDrawing
                points={points}
                selected={selected}
                onAdd={addPoint}
                onSelect={setSelected}
                className="w-full max-w-[260px]"
              />
              <p className="text-label-secondary text-center text-[11px]">
                Clique no rosto para marcar. O lado direito do paciente fica à esquerda.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              {points.length === 0 && (
                <p className="text-label-secondary text-[13px]">
                  Nenhum ponto ainda. A região é preenchida pela posição; produto e quantidade se
                  repetem do ponto anterior.
                </p>
              )}
              {points.map((p, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid grid-cols-[24px_1fr_auto] items-center gap-1.5 rounded-xl p-1.5 sm:grid-cols-[24px_1.2fr_1.2fr_70px_110px_auto]',
                    selected === i ? 'bg-system-blue/[0.07]' : 'bg-foreground/[0.03]',
                  )}
                  onFocus={() => setSelected(i)}
                >
                  <span className="text-center text-[12px] font-bold">{i + 1}</span>
                  <Input
                    value={p.area}
                    maxLength={60}
                    aria-label={`Região do ponto ${i + 1}`}
                    onChange={(e) => update(i, { area: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="sm:order-last"
                    aria-label={`Tirar o ponto ${i + 1}`}
                    onClick={() => {
                      setPoints(points.filter((_, j) => j !== i));
                      setSelected(null);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                  <Input
                    className="col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto"
                    placeholder="Produto"
                    value={p.product}
                    maxLength={80}
                    aria-label={`Produto do ponto ${i + 1}`}
                    onChange={(e) => update(i, { product: e.target.value })}
                  />
                  <Input
                    className="col-start-2 sm:col-start-auto"
                    placeholder="Qtd."
                    inputMode="decimal"
                    value={p.amount}
                    aria-label={`Quantidade do ponto ${i + 1}`}
                    onChange={(e) => update(i, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                  />
                  <select
                    className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
                    value={p.unit}
                    aria-label={`Unidade do ponto ${i + 1}`}
                    onChange={(e) => update(i, { unit: e.target.value as FaceUnit })}
                  >
                    {FACE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {FACE_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Totals points={points.map((p) => ({ ...p, amount: parseAmount(p.amount) }))} />
            </div>
          </div>
          <Textarea
            placeholder="Observações (lote do produto, diluição, orientações dadas...)"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={save.isPending || !title.trim() || points.length === 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Salvando...' : 'Salvar aplicação'}
            </Button>
          </div>
        </Surface>
      )}

      {maps.length === 0 && !editing && (
        <p className="text-label-secondary text-[14px]">
          Nenhuma aplicação registrada. Use para toxina, preenchimento, bioestimulador e fios:
          marque os pontos no rosto com o produto e a quantidade.
        </p>
      )}

      {maps.map((m) => (
        <Surface
          key={m.id}
          className={cn('grid gap-4 p-4 md:grid-cols-[160px_1fr]', m.canceledAt && 'opacity-60')}
        >
          <FaceDrawing points={m.points} className="mx-auto w-full max-w-[160px]" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold">
                  {m.title}
                  {m.canceledAt && (
                    <span className="bg-system-red/10 text-system-red ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      Anulada
                    </span>
                  )}
                </h3>
                <p className="text-label-secondary text-[12px]">
                  {when(m.createdAt)} · {m.authorName}
                  {m.canceledAt && m.cancelReason
                    ? ` · anulada por ${m.canceledByName ?? 'equipe'}: ${m.cancelReason}`
                    : ''}
                </p>
              </div>
              {!m.canceledAt && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCanceling({ id: m.id, title: m.title })}
                >
                  <BanIcon /> Anular
                </Button>
              )}
            </div>
            <Totals points={m.points} />
            <ol className="flex flex-col gap-0.5 text-[13px]">
              {m.points.map((p, i) => (
                <li key={i}>
                  <span className="text-label-secondary tabular-nums">{i + 1}.</span> {p.area}
                  {p.product ? ` · ${p.product}` : ''}
                  {p.amount !== null ? ` · ${formatAmount(p.amount, p.unit)}` : ''}
                </li>
              ))}
            </ol>
            {m.notes && (
              <p className="text-label-secondary text-[13px] whitespace-pre-wrap">{m.notes}</p>
            )}
          </div>
        </Surface>
      ))}

      <Dialog
        open={canceling !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setCanceling(null);
            setReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular &quot;{canceling?.title}&quot;?</DialogTitle>
            <DialogDescription>
              A aplicação continua no prontuário, marcada como anulada, com o motivo.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 3) cancel.mutate();
            }}
          >
            <Input
              autoFocus
              placeholder="Motivo (ex.: quantidade registrada errada)"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCanceling(null)}>
                Voltar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={reason.trim().length < 3 || cancel.isPending}
              >
                {cancel.isPending ? 'Anulando...' : 'Anular'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
