'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { QuoteEditor, draftFromContent } from '@/components/orcamentos/quote-editor';
import {
  approveQuoteAction,
  cancelQuoteAction,
  convertQuoteToPackageAction,
  createQuoteFollowUpAction,
  duplicateQuoteAction,
  getQuoteAction,
  rejectQuoteAction,
  revokeQuoteLinksAction,
  shareQuoteAction,
} from '@/server/actions/quote-actions';

const STATUS_VARIANT = {
  DRAFT: 'outline',
  SENT: 'default',
  APPROVED: 'secondary',
  REJECTED: 'destructive',
  EXPIRED: 'destructive',
  CANCELED: 'destructive',
} as const;

const VIA_LABEL: Record<string, string> = {
  staff: 'registrada pela equipe',
  client_link: 'pelo cliente, no link',
  client_portal: 'pelo cliente, na área do cliente',
};

function fmtDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export function QuoteDetailDrawer({
  quoteId,
  onOpenChange,
  timezone,
  onOpenQuote,
}: {
  quoteId: string | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  onOpenQuote: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => getQuoteAction(quoteId!).then(unwrapResult),
    enabled: !!quoteId,
  });
  const [editing, setEditing] = React.useState(false);
  const [share, setShare] = React.useState<{
    url: string;
    message: string;
    whatsappUrl: string | null;
  } | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [approvalNote, setApprovalNote] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [confirm, setConfirm] = React.useState<'cancel' | 'convert' | null>(null);
  const [taskDue, setTaskDue] = React.useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };
  const run = <T,>(fn: () => Promise<T>, success: string) =>
    fn()
      .then((r) => {
        toast.success(success);
        return r;
      })
      .catch((e: Error) => {
        toast.error(e.message || 'Não foi possível concluir.', { duration: 9000 });
        throw e;
      })
      .finally(refresh);

  const shareMutation = useMutation({
    mutationFn: () => run(() => shareQuoteAction(quoteId!).then(unwrapResult), 'Link gerado.'),
    onSuccess: (r) => setShare(r),
  });
  const approve = useMutation({
    mutationFn: () =>
      run(
        () =>
          approveQuoteAction({
            id: quote!.id,
            version: quote!.currentVersion,
            contentHash: quote!.current.contentHash,
            note: approvalNote || null,
          }).then(unwrapResult),
        'Aprovação registrada.',
      ),
    onSuccess: () => setApproving(false),
  });
  const reject = useMutation({
    mutationFn: () =>
      run(
        () => rejectQuoteAction({ id: quote!.id, reason: reason || null }).then(unwrapResult),
        'Recusa registrada.',
      ),
    onSuccess: () => setRejecting(false),
  });
  const cancel = useMutation({
    mutationFn: () => run(() => cancelQuoteAction(quote!.id).then(unwrapResult), 'Cancelado.'),
    onSuccess: () => setConfirm(null),
  });
  const convert = useMutation({
    mutationFn: () =>
      run(
        () => convertQuoteToPackageAction(quote!.id).then(unwrapResult),
        'Pacote criado no cliente (sem cobrança lançada).',
      ),
    onSuccess: () => setConfirm(null),
    onError: () => setConfirm(null),
  });
  const duplicate = useMutation({
    mutationFn: () =>
      run(() => duplicateQuoteAction(quote!.id).then(unwrapResult), 'Cópia criada como rascunho.'),
    onSuccess: (r) => onOpenQuote(r.id),
  });
  const revoke = useMutation({
    mutationFn: () =>
      run(() => revokeQuoteLinksAction(quote!.id).then(unwrapResult), 'Links desativados.'),
  });
  const followUp = useMutation({
    mutationFn: () =>
      run(
        () =>
          createQuoteFollowUpAction({
            id: quote!.id,
            dueAt: taskDue ? new Date(`${taskDue}T12:00:00`) : null,
          }).then(unwrapResult),
        'Tarefa de acompanhamento criada.',
      ),
    onSuccess: () => setTaskDue(''),
  });

  // Memorizado pela versão: refazer a busca não reinicia o que está sendo digitado.
  const editInitial = React.useMemo(
    () =>
      quote
        ? draftFromContent(quote.content, {
            clientId: quote.client.id,
            title: quote.title,
            responsibleProfessionalId: quote.responsibleProfessionalId,
          })
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quote?.id, quote?.currentVersion],
  );
  const status = quote?.status;
  const awaiting = status === 'DRAFT' || status === 'SENT';
  const editable = quote && !quote.converted && status !== 'CANCELED';

  return (
    <Drawer direction="right" open={!!quoteId} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:max-w-xl!">
        {!quote ? (
          <div className="text-label-secondary p-6 text-sm">
            {isLoading ? 'Carregando…' : 'Orçamento não encontrado.'}
          </div>
        ) : (
          <>
            <DrawerHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DrawerTitle>
                  #{quote.number} {quote.title}
                </DrawerTitle>
                <Badge variant={STATUS_VARIANT[quote.status]}>
                  {QUOTE_STATUS_LABEL[quote.status]}
                </Badge>
                {quote.origin === 'ai' && <Badge variant="outline">Preparado pela IA</Badge>}
              </div>
              <DrawerDescription>
                <Link href={`/clientes/${quote.client.id}`} className="hover:underline">
                  {quote.client.name}
                </Link>{' '}
                · versão {quote.currentVersion}
                {quote.current.validUntil &&
                  ` · válido até ${fmtDate(quote.current.validUntil, timezone)}`}
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 text-sm">
              <ul className="flex flex-col gap-1.5">
                {quote.current.items.map((item, i) => (
                  <li key={i} className="bg-foreground/[0.03] rounded-xl px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{item.description}</span>
                      <span className="tabular-nums">{formatCurrencyBRL(item.lineTotal)}</span>
                    </div>
                    <div className="text-label-secondary text-[12px]">
                      {item.quantity} × {formatCurrencyBRL(item.unitPrice)}
                      {(item.sessions ?? 1) > 1 && ` · ${item.sessions} sessões cada`}
                      {item.discount > 0 && ` · desconto ${formatCurrencyBRL(item.discount)}`}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-0.5 tabular-nums">
                {quote.current.discount > 0 && (
                  <div className="text-label-secondary flex justify-between">
                    <span>Desconto geral</span>
                    <span>− {formatCurrencyBRL(quote.current.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[16px] font-semibold">
                  <span>Total</span>
                  <span>{formatCurrencyBRL(quote.current.total)}</span>
                </div>
              </div>
              {quote.current.paymentTerms && (
                <p>
                  <span className="text-label-secondary">Pagamento: </span>
                  {quote.current.paymentTerms}
                </p>
              )}
              {quote.current.notes && (
                <p className="text-label-secondary whitespace-pre-line">{quote.current.notes}</p>
              )}

              {quote.approved && (
                <p className="bg-system-green/[0.08] rounded-xl px-3 py-2 text-[13px]">
                  Versão {quote.approved.version} aprovada
                  {quote.approved.at && ` em ${fmtDate(quote.approved.at, timezone)}`}{' '}
                  {quote.approved.via && VIA_LABEL[quote.approved.via]}.
                  {!quote.approved.isCurrent &&
                    ' A versão atual mudou depois e ainda não foi aprovada.'}
                  {quote.approved.note && ` “${quote.approved.note}”`}
                </p>
              )}
              {quote.rejected && status === 'REJECTED' && (
                <p className="bg-system-red/[0.06] rounded-xl px-3 py-2 text-[13px]">
                  Recusado em {fmtDate(quote.rejected.at, timezone)}
                  {quote.rejected.reason && `: “${quote.rejected.reason}”`}
                </p>
              )}
              {quote.converted && (
                <p className="bg-system-blue/[0.06] rounded-xl px-3 py-2 text-[13px]">
                  Convertido em pacote em {fmtDate(quote.converted.at, timezone)}
                  {quote.converted.packageName && ` (${quote.converted.packageName})`}.{' '}
                  <Link
                    href={`/clientes/${quote.client.id}?aba=pacotes`}
                    className="text-system-blue underline"
                  >
                    Abrir pacote
                  </Link>{' '}
                  — o pagamento é lançado no pacote, quando acontecer.
                </p>
              )}

              {share && (
                <div className="border-system-blue/30 flex flex-col gap-2 rounded-2xl border p-3">
                  <span className="text-[13px] font-medium">Link protegido para o cliente</span>
                  <p className="text-label-secondary text-[12px]">
                    Vale só para este orçamento, expira e pode ser desativado. Nada é enviado
                    automaticamente: mande pelo seu WhatsApp.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {share.whatsappUrl && (
                      <Button size="sm" asChild>
                        <a href={share.whatsappUrl} target="_blank" rel="noreferrer">
                          <SendIcon className="size-3.5" /> Abrir no WhatsApp
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(share.url)
                          .then(() => toast.success('Link copiado.'))
                      }
                    >
                      <CopyIcon className="size-3.5" /> Copiar link
                    </Button>
                  </div>
                </div>
              )}

              {approving && (
                <div className="flex flex-col gap-2 rounded-2xl border p-3">
                  <span className="text-[13px] font-medium">
                    Registrar aprovação da versão {quote.currentVersion} (
                    {formatCurrencyBRL(quote.current.total)})
                  </span>
                  <Input
                    placeholder="Como o cliente aprovou (ex.: pelo WhatsApp)"
                    maxLength={500}
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                  />
                  <p className="text-label-secondary text-[12px]">
                    Aprovar não é pagamento: nada é lançado no financeiro.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
                      Confirmar aprovação
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApproving(false)}>
                      Voltar
                    </Button>
                  </div>
                </div>
              )}
              {rejecting && (
                <div className="flex flex-col gap-2 rounded-2xl border p-3">
                  <Textarea
                    rows={2}
                    placeholder="Motivo (opcional)"
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={reject.isPending}
                      onClick={() => reject.mutate()}
                    >
                      Registrar recusa
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                      Voltar
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {awaiting && (
                  <Button
                    size="sm"
                    disabled={shareMutation.isPending}
                    onClick={() => shareMutation.mutate()}
                  >
                    {status === 'DRAFT' ? 'Enviar (gerar link)' : 'Gerar novo link'}
                  </Button>
                )}
                {awaiting && !approving && (
                  <Button size="sm" variant="outline" onClick={() => setApproving(true)}>
                    Registrar aprovação
                  </Button>
                )}
                {awaiting && !rejecting && (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                    Cliente recusou
                  </Button>
                )}
                {status === 'APPROVED' && !quote.converted && quote.canConvert.ok && (
                  <Button size="sm" onClick={() => setConfirm('convert')}>
                    Converter em pacote
                  </Button>
                )}
                {editable && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    {status === 'DRAFT' ? 'Editar' : 'Alterar (nova versão)'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate()}
                >
                  Duplicar
                </Button>
                {quote.shareActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate()}
                  >
                    Desativar link
                  </Button>
                )}
                {editable && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm('cancel')}>
                    Cancelar orçamento
                  </Button>
                )}
              </div>
              {status === 'APPROVED' && !quote.converted && !quote.canConvert.ok && (
                <p className="text-label-secondary text-[12px]">{quote.canConvert.reason}</p>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-label-secondary text-[12px] font-semibold uppercase">
                  Acompanhamento
                </span>
                {quote.tasks.map((t) => (
                  <div key={t.id} className="text-[13px]">
                    {t.status === 'DONE' ? '✓ ' : '• '}
                    {t.title}
                    {t.dueAt && ` — até ${fmtDate(t.dueAt, timezone)}`}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    className="w-40"
                    aria-label="Retornar em"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={followUp.isPending}
                    onClick={() => followUp.mutate()}
                  >
                    Criar tarefa de retorno
                  </Button>
                </div>
              </div>

              {quote.history.length > 1 && (
                <details className="text-[13px]">
                  <summary className="text-label-secondary cursor-pointer">
                    Versões anteriores ({quote.history.length - 1})
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {quote.history
                      .filter((v) => v.version !== quote.currentVersion)
                      .map((v) => (
                        <li key={v.version}>
                          Versão {v.version} · {formatCurrencyBRL(v.total)} ·{' '}
                          {fmtDate(v.createdAt, timezone)}
                          {quote.approved?.version === v.version && ' · aprovada'}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>

            <QuoteEditor
              open={editing}
              onOpenChange={setEditing}
              quoteId={quote.id}
              expectedVersion={quote.currentVersion}
              status={quote.status}
              lockedClient
              initial={editInitial}
              onSaved={refresh}
            />
            <ConfirmDialog
              open={confirm === 'cancel'}
              onOpenChange={(o: boolean) => !o && setConfirm(null)}
              title="Cancelar este orçamento?"
              description="Os links enviados deixam de funcionar. O histórico continua guardado."
              confirmLabel="Cancelar orçamento"
              destructive
              pending={cancel.isPending}
              onConfirm={() => cancel.mutate()}
            />
            <ConfirmDialog
              open={confirm === 'convert'}
              onOpenChange={(o: boolean) => !o && setConfirm(null)}
              title="Converter em pacote?"
              description={`Cria o pacote no cliente com o valor aprovado (${formatCurrencyBRL(quote.current.total)}), sem lançar cobrança. O pagamento é registrado no pacote quando acontecer. Só pode ser feito uma vez.`}
              confirmLabel="Criar pacote"
              pending={convert.isPending}
              onConfirm={() => convert.mutate()}
            />
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
