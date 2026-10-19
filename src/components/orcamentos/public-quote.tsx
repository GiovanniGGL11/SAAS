'use client';

import * as React from 'react';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';

import { formatCurrencyBRL } from '@/lib/serialize';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { respondQuoteByTokenAction } from '@/server/actions/quote-actions';
import type { ClientQuoteView } from '@/server/data/quotes';

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Corpo do orçamento visto pelo cliente (link protegido e área do cliente usam o mesmo). */
export function QuoteBody({ quote }: { quote: ClientQuoteView }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {quote.items.map((item, i) => (
          <li key={i} className="bg-foreground/[0.04] rounded-2xl px-4 py-3">
            <div className="flex justify-between gap-3 text-[15px]">
              <span className="font-medium">{item.description}</span>
              <span className="tabular-nums">{formatCurrencyBRL(item.lineTotal)}</span>
            </div>
            <div className="text-label-secondary text-[13px]">
              {item.quantity} × {formatCurrencyBRL(item.unitPrice)}
              {item.sessions > 1 && ` · ${item.sessions} sessões`}
              {item.discount > 0 && ` · desconto de ${formatCurrencyBRL(item.discount)}`}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 px-1 text-[15px] tabular-nums">
        {quote.discount > 0 && (
          <div className="text-label-secondary flex justify-between">
            <span>Desconto</span>
            <span>− {formatCurrencyBRL(quote.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-[18px] font-semibold">
          <span>Total</span>
          <span>{formatCurrencyBRL(quote.total)}</span>
        </div>
      </div>
      {quote.paymentTerms && (
        <p className="text-[14px]">
          <span className="text-label-secondary">Pagamento: </span>
          {quote.paymentTerms}
        </p>
      )}
      {quote.notes && (
        <p className="text-label-secondary text-[14px] whitespace-pre-line">{quote.notes}</p>
      )}
      {quote.validUntil && (
        <p className="text-label-secondary text-[13px]">Válido até {fmtDate(quote.validUntil)}.</p>
      )}
    </div>
  );
}

/**
 * Página do link protegido. Aprovar envia a versão e o hash do que está na tela: se a empresa
 * mudou o orçamento nesse meio-tempo, a aprovação é recusada e o cliente vê o aviso.
 */
export function PublicQuote({ token, quote }: { token: string; quote: ClientQuoteView }) {
  const [state, setState] = React.useState<'idle' | 'approved' | 'rejected'>(
    quote.status === 'APPROVED' ? 'approved' : quote.status === 'REJECTED' ? 'rejected' : 'idle',
  );
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function respond(approve: boolean) {
    setPending(true);
    setError(null);
    const result = await respondQuoteByTokenAction(
      approve
        ? { token, approve: true, version: quote.version, contentHash: quote.contentHash }
        : { token, approve: false, reason: reason || undefined },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(approve ? 'approved' : 'rejected');
  }

  const open = quote.status === 'SENT' && state === 'idle';

  return (
    <main className="font-apple bg-background mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-1">
        <span className="text-label-secondary text-[13px]">{quote.companyName}</span>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{quote.title}</h1>
        <span className="text-label-secondary text-[13px]">
          Orçamento #{quote.number} · {QUOTE_STATUS_LABEL[quote.status]}
        </span>
      </header>

      <QuoteBody quote={quote} />

      {state === 'approved' && (
        <p className="bg-system-green/[0.1] flex items-center gap-2 rounded-2xl p-4 text-[15px]">
          <CheckCircle2Icon className="text-system-green size-5 shrink-0" />
          Orçamento aprovado. A empresa vai combinar com você os próximos passos e o pagamento.
        </p>
      )}
      {state === 'rejected' && (
        <p className="bg-foreground/[0.05] flex items-center gap-2 rounded-2xl p-4 text-[15px]">
          <XCircleIcon className="text-label-secondary size-5 shrink-0" />
          Resposta registrada. Obrigado por avisar.
        </p>
      )}
      {quote.status === 'EXPIRED' && (
        <p className="bg-foreground/[0.05] rounded-2xl p-4 text-[15px]">
          Este orçamento venceu. Peça uma versão atualizada à empresa.
        </p>
      )}
      {error && (
        <p className="bg-system-red/[0.08] text-system-red rounded-2xl p-4 text-[14px]">{error}</p>
      )}

      {open && (
        <div className="bg-background sticky bottom-0 flex flex-col gap-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
          {rejecting ? (
            <>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Quer contar o motivo? (opcional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => respond(false)}
                >
                  Recusar orçamento
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Voltar
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button size="lg" disabled={pending} onClick={() => respond(true)}>
                {pending ? 'Enviando…' : `Aprovar ${formatCurrencyBRL(quote.total)}`}
              </Button>
              <p className="text-label-secondary text-center text-[12px]">
                Aprovar não gera cobrança automática: o pagamento é combinado com a empresa.
              </p>
              <Button variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>
                Não quero
              </Button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
