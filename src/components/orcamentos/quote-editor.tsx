'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { lineTotal, quoteTotals, type QuoteContent } from '@/lib/quotes';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listClientsAction } from '@/server/actions/client-actions';
import { listServicesAction } from '@/server/actions/service-actions';
import { listActiveProductsAction } from '@/server/actions/stock-actions';
import { listProfessionalsAction } from '@/server/actions/professional-actions';
import { createQuoteAction, updateQuoteAction } from '@/server/actions/quote-actions';

type Kind = 'service' | 'product' | 'custom';
type Row = {
  kind: Kind;
  refId: string;
  description: string;
  quantity: string;
  sessions: string;
  unitPrice: string;
  discount: string;
};

export type QuoteDraft = {
  clientId: string;
  title: string;
  responsibleProfessionalId: string;
  rows: Row[];
  discount: string;
  paymentTerms: string;
  notes: string;
  validUntil: string;
};

const emptyRow = (): Row => ({
  kind: 'service',
  refId: '',
  description: '',
  quantity: '1',
  sessions: '1',
  unitPrice: '',
  discount: '',
});

const num = (v: string) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function draftFromContent(
  content: QuoteContent,
  meta: { clientId: string; title: string; responsibleProfessionalId: string | null },
): QuoteDraft {
  return {
    clientId: meta.clientId,
    title: meta.title,
    responsibleProfessionalId: meta.responsibleProfessionalId ?? '',
    rows: content.items.map((i) => ({
      kind: i.kind,
      refId: i.refId ?? '',
      description: i.description,
      quantity: String(i.quantity),
      sessions: String(i.sessions ?? 1),
      unitPrice: String(i.unitPrice),
      discount: i.discount ? String(i.discount) : '',
    })),
    discount: content.discount ? String(content.discount) : '',
    paymentTerms: content.paymentTerms ?? '',
    notes: content.notes ?? '',
    validUntil: content.validUntil ?? '',
  };
}

function toContent(draft: QuoteDraft) {
  return {
    items: draft.rows.map((r) => ({
      kind: r.kind,
      refId: r.kind === 'custom' ? null : r.refId || null,
      description: r.description.trim(),
      quantity: Math.max(1, Math.round(num(r.quantity))),
      sessions: r.kind === 'service' ? Math.max(1, Math.round(num(r.sessions))) : 1,
      unitPrice: num(r.unitPrice),
      discount: num(r.discount),
    })),
    discount: num(draft.discount),
    paymentTerms: draft.paymentTerms.trim() || null,
    notes: draft.notes.trim() || null,
    validUntil: draft.validUntil || null,
  };
}

/** Rascunho guardado no aparelho: fechar sem querer não perde o que foi digitado. */
function storageKey(id: string | null) {
  return `atendafy:quote-draft:${id ?? 'new'}`;
}
function loadStored(id: string | null): QuoteDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}
function store(id: string | null, draft: QuoteDraft | null) {
  try {
    if (draft) window.localStorage.setItem(storageKey(id), JSON.stringify(draft));
    else window.localStorage.removeItem(storageKey(id));
  } catch {
    // Sem armazenamento (aba anônima): segue sem rascunho local.
  }
}

type EditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string | null;
  expectedVersion?: number;
  initial?: QuoteDraft;
  lockedClient?: boolean;
  status?: string;
  /** Oportunidade de origem (só ao criar). */
  opportunityId?: string;
  onSaved: (id: string) => void;
};

export function QuoteEditor(props: EditorProps) {
  return props.open ? <QuoteEditorInner {...props} /> : null;
}

/**
 * Criar ou alterar um orçamento. O servidor recalcula os valores; os totais aqui são só prévia.
 * Alterar um orçamento já enviado ou aprovado cria uma versão nova (que precisa de nova aprovação).
 */
function QuoteEditorInner({
  open,
  onOpenChange,
  quoteId,
  expectedVersion,
  initial,
  lockedClient,
  status,
  onSaved,
  opportunityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string | null;
  expectedVersion?: number;
  initial?: QuoteDraft;
  lockedClient?: boolean;
  status?: string;
  opportunityId?: string;
  onSaved: (id: string) => void;
}) {
  const blank: QuoteDraft = React.useMemo(
    () =>
      initial ?? {
        clientId: '',
        title: '',
        responsibleProfessionalId: '',
        rows: [emptyRow()],
        discount: '',
        paymentTerms: '',
        notes: '',
        validUntil: '',
      },
    [initial],
  );
  // Montado só enquanto aberto: o estado começa do rascunho guardado no aparelho (se for do
  // mesmo cliente) ou do conteúdo atual.
  const [initialState] = React.useState(() => {
    const saved = loadStored(quoteId);
    return saved && (!initial || saved.clientId === initial.clientId)
      ? { draft: saved, restored: true }
      : { draft: blank, restored: false };
  });
  const [draft, setDraft] = React.useState<QuoteDraft>(initialState.draft);
  const [restored, setRestored] = React.useState(initialState.restored);

  const update = (patch: Partial<QuoteDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      store(quoteId, next);
      return next;
    });
  const updateRow = (index: number, patch: Partial<Row>) =>
    update({ rows: draft.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsAction,
    enabled: open && !lockedClient,
  });
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: listServicesAction,
    enabled: open,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: () => listActiveProductsAction(),
    enabled: open,
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ['professionals'],
    queryFn: listProfessionalsAction,
    enabled: open,
  });

  const content = toContent(draft);
  const totals = quoteTotals(content);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        clientId: draft.clientId,
        title: draft.title.trim(),
        responsibleProfessionalId: draft.responsibleProfessionalId || null,
        ...content,
      };
      if (quoteId) {
        await updateQuoteAction({ id: quoteId, expectedVersion, ...payload }).then(unwrapResult);
        return quoteId;
      }
      return (
        await createQuoteAction({ ...payload, opportunityId: opportunityId ?? null }).then(
          unwrapResult,
        )
      ).id;
    },
    onSuccess: (id) => {
      store(quoteId, null);
      toast.success(quoteId ? 'Orçamento atualizado.' : 'Orçamento criado.');
      onSaved(id);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  const clientOptions: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }));
  const serviceOptions: ComboboxOption[] = services
    .filter((s) => s.active)
    .map((s) => ({ value: s.id, label: s.name }));
  const productOptions: ComboboxOption[] = products.map((p) => ({ value: p.id, label: p.name }));
  const willVersion = quoteId && status && status !== 'DRAFT';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{quoteId ? 'Alterar orçamento' : 'Novo orçamento'}</DialogTitle>
          <DialogDescription>
            {willVersion
              ? 'Este orçamento já foi enviado: salvar cria uma versão nova, que volta para rascunho e precisa de nova aprovação. A versão anterior fica guardada.'
              : 'Serviços, produtos ou itens livres. Aprovar o orçamento não lança cobrança.'}
          </DialogDescription>
        </DialogHeader>
        {restored && (
          <p className="bg-system-blue/[0.06] text-system-blue rounded-xl px-3 py-2 text-[12px]">
            Recuperamos o que você estava digitando.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                store(quoteId, null);
                setDraft(blank);
                setRestored(false);
              }}
            >
              Descartar
            </button>
          </p>
        )}
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!lockedClient && (
            <Combobox
              options={clientOptions}
              value={draft.clientId}
              onChange={(clientId) => update({ clientId })}
              placeholder="Cliente"
              searchPlaceholder="Buscar cliente…"
            />
          )}
          <Input
            placeholder="Nome do orçamento (ex.: Tratamento facial — 8 sessões)"
            maxLength={120}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            aria-label="Nome do orçamento"
          />

          <div className="flex flex-col gap-2">
            {draft.rows.map((row, index) => (
              <div key={index} className="bg-foreground/[0.03] flex flex-col gap-2 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={row.kind}
                    onValueChange={(kind: string) =>
                      updateRow(index, { kind: kind as Kind, refId: '' })
                    }
                  >
                    <SelectTrigger
                      className="w-32 shrink-0"
                      aria-label={`Tipo do item ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service">Serviço</SelectItem>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="custom">Item livre</SelectItem>
                    </SelectContent>
                  </Select>
                  {row.kind !== 'custom' ? (
                    <div className="min-w-0 flex-1">
                      <Combobox
                        options={row.kind === 'service' ? serviceOptions : productOptions}
                        value={row.refId}
                        onChange={(refId) => {
                          const service = services.find((s) => s.id === refId);
                          const product = products.find((p) => p.id === refId);
                          updateRow(index, {
                            refId,
                            description: service?.name ?? product?.name ?? row.description,
                            unitPrice:
                              row.unitPrice || String(service?.price ?? product?.salePrice ?? ''),
                          });
                        }}
                        placeholder={row.kind === 'service' ? 'Serviço' : 'Produto'}
                      />
                    </div>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover item"
                    disabled={draft.rows.length === 1}
                    onClick={() => update({ rows: draft.rows.filter((_, i) => i !== index) })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Input
                  placeholder="Descrição que o cliente vê"
                  maxLength={200}
                  value={row.description}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                  aria-label={`Descrição do item ${index + 1}`}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 text-[12px]">
                    <span className="text-label-secondary">Quantidade</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    />
                  </label>
                  {row.kind === 'service' && (
                    <label className="flex flex-col gap-1 text-[12px]">
                      <span className="text-label-secondary">Sessões</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={row.sessions}
                        onChange={(e) => updateRow(index, { sessions: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-[12px]">
                    <span className="text-label-secondary">Valor unitário (R$)</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(index, { unitPrice: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px]">
                    <span className="text-label-secondary">Desconto (R$)</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={row.discount}
                      onChange={(e) => updateRow(index, { discount: e.target.value })}
                    />
                  </label>
                </div>
                <div className="text-label-secondary text-right text-[12px] tabular-nums">
                  {formatCurrencyBRL(
                    lineTotal({
                      quantity: Math.max(1, Math.round(num(row.quantity))),
                      unitPrice: num(row.unitPrice),
                      discount: num(row.discount),
                    }),
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={draft.rows.length >= 30}
              onClick={() => update({ rows: [...draft.rows, emptyRow()] })}
            >
              <PlusIcon /> Adicionar item
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Desconto geral (R$)</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={draft.discount}
                onChange={(e) => update({ discount: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Válido até</span>
              <Input
                type="date"
                value={draft.validUntil}
                onChange={(e) => update({ validUntil: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] sm:col-span-2">
              <span className="text-label-secondary">Responsável</span>
              <Select
                value={draft.responsibleProfessionalId || 'none'}
                onValueChange={(v: string) =>
                  update({ responsibleProfessionalId: v === 'none' ? '' : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {professionals
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="Condições de pagamento (ex.: 3x no cartão ou PIX à vista)"
            value={draft.paymentTerms}
            onChange={(e) => update({ paymentTerms: e.target.value })}
            aria-label="Condições de pagamento"
          />
          <Textarea
            rows={2}
            maxLength={2000}
            placeholder="Observações para o cliente"
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
            aria-label="Observações para o cliente"
          />

          <div className="bg-foreground/[0.04] flex flex-col gap-0.5 rounded-2xl p-3 text-[14px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-label-secondary">Subtotal</span>
              <span>{formatCurrencyBRL(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-label-secondary">Desconto geral</span>
                <span>− {formatCurrencyBRL(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[16px] font-semibold">
              <span>Total</span>
              <span>{formatCurrencyBRL(totals.total)}</span>
            </div>
          </div>

          <div className="bg-background sticky bottom-0 flex gap-2 pt-1 pb-1">
            <Button
              type="submit"
              disabled={save.isPending || !draft.clientId || !draft.title.trim()}
            >
              {save.isPending ? 'Salvando…' : willVersion ? 'Salvar nova versão' : 'Salvar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
