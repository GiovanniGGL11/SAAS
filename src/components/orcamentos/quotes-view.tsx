'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileTextIcon, PlusIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { QUOTE_STATUS_LABEL, type QuoteStatusValue } from '@/lib/quotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { QuoteEditor } from '@/components/orcamentos/quote-editor';
import { QuoteDetailDrawer } from '@/components/orcamentos/quote-detail';
import { listQuotesAction } from '@/server/actions/quote-actions';

const FILTERS: { value: '' | QuoteStatusValue; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'DRAFT', label: 'Rascunhos' },
  { value: 'SENT', label: 'Enviados' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Recusados' },
  { value: 'EXPIRED', label: 'Vencidos' },
];

/** Lista de orçamentos (da empresa ou de um cliente), com o detalhe num painel lateral. */
export function QuotesView({
  timezone,
  clientId,
  clientName,
  initialOpenId,
  initialNewForClient,
  initialOpportunityId,
}: {
  timezone: string;
  clientId?: string;
  clientName?: string;
  initialOpenId?: string;
  initialNewForClient?: string;
  /** Orçamento novo já ligado a uma oportunidade. */
  initialOpportunityId?: string;
}) {
  const [status, setStatus] = React.useState<'' | QuoteStatusValue>('');
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId ?? null);
  const [creating, setCreating] = React.useState(Boolean(initialNewForClient));
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes', clientId ?? 'all', status],
    queryFn: () => listQuotesAction({ status: status || undefined, clientId }).then(unwrapResult),
  });
  const newClient = clientId ?? initialNewForClient;
  // Memorizado: um objeto novo a cada render faria o editor recomeçar no meio da digitação.
  const newDraft = React.useMemo(
    () =>
      newClient
        ? {
            clientId: newClient,
            title: '',
            responsibleProfessionalId: '',
            rows: [
              {
                kind: 'service' as const,
                refId: '',
                description: '',
                quantity: '1',
                sessions: '1',
                unitPrice: '',
                discount: '',
              },
            ],
            discount: '',
            paymentTerms: '',
            notes: '',
            validUntil: '',
          }
        : undefined,
    [newClient],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          Novo orçamento
        </Button>
      </div>

      {!isLoading && quotes.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title={status ? 'Nenhum orçamento com essa situação' : 'Nenhum orçamento ainda'}
          description={
            clientName
              ? `Prepare um orçamento para ${clientName} com sessões, produtos e condições de pagamento.`
              : 'Prepare orçamentos com sessões, produtos e condições; envie por link protegido e converta em pacote quando aprovado.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setOpenId(q.id)}
                className="bg-tile hover:bg-foreground/[0.04] flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">
                    #{q.number} {q.title}
                  </div>
                  <div className="text-label-secondary truncate text-[13px]">
                    {clientId ? '' : `${q.client.name} · `}
                    versão {q.currentVersion}
                    {q.validUntil &&
                      ` · válido até ${new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: '2-digit' }).format(new Date(q.validUntil))}`}
                    {q.converted && ' · virou pacote'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[15px] font-semibold tabular-nums">
                    {formatCurrencyBRL(q.total)}
                  </span>
                  <Badge variant={q.status === 'APPROVED' ? 'secondary' : 'outline'}>
                    {QUOTE_STATUS_LABEL[q.status]}
                  </Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <QuoteEditor
        open={creating}
        onOpenChange={setCreating}
        quoteId={null}
        lockedClient={Boolean(clientId)}
        initial={newDraft}
        opportunityId={initialOpportunityId}
        onSaved={(id) => setOpenId(id)}
      />
      <QuoteDetailDrawer
        quoteId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        timezone={timezone}
        onOpenQuote={setOpenId}
      />
    </div>
  );
}
