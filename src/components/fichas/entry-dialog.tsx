'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CopyIcon, DownloadIcon, LinkIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import {
  type Answers,
  type FormSchema,
  FORM_TYPE_LABEL,
  validateAnswers,
} from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormRenderer } from '@/components/fichas/form-renderer';
import { EntryStatusBadge } from '@/components/fichas/entry-status-badge';
import { AutosaveText, useAutosave } from '@/components/fichas/use-autosave';
import { FILLER_LABEL, formatDate } from '@/components/fichas/labels';
import {
  createEntryLinkAction,
  getEntryDetailAction,
  getEntryRevisionAction,
  getMyFormAccessAction,
  listEntryAuditAction,
  requestEntryUpdateAction,
  reviewEntryAction,
  revokeEntryLinksAction,
  saveEntryDraftAction,
  submitEntryAction,
} from '@/server/actions/form-actions';

export type EntrySummary = {
  id: string;
  status: 'REQUESTED' | 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  template: { name: string; type: keyof typeof FORM_TYPE_LABEL };
  client?: { name: string };
  fillableBy?: keyof typeof FILLER_LABEL;
};

export function useFormAccess() {
  return useQuery({
    queryKey: ['form-access'],
    queryFn: () => getMyFormAccessAction(),
    staleTime: 60_000,
  });
}

function invalidateEntries(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ['form-entries', 'client-entries', 'appointment-forms', 'form-entry']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Abre uma ficha. Quem pode ler vê as respostas (e preenche, revisa, corrige, exporta conforme
 * a permissão); quem só acompanha vê o status e pode gerar o link para o cliente.
 */
export function EntryDialog({
  entry,
  open,
  onOpenChange,
  timezone,
}: {
  entry: EntrySummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const { data: access } = useFormAccess();
  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{entry.template.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {entry.client?.name && <span>{entry.client.name}</span>}
            <span>{FORM_TYPE_LABEL[entry.template.type]}</span>
            <EntryStatusBadge status={entry.status} />
          </DialogDescription>
        </DialogHeader>
        {access?.canRead ? (
          // A chave remonta o conteúdo ao trocar de ficha (estado novo, sem efeito).
          <EntryContent
            key={entry.id}
            entryId={entry.id}
            timezone={timezone}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-label-secondary text-[14px]">
              Você acompanha o status desta ficha, mas não tem permissão para ver as respostas.
            </p>
            {access?.canRequest &&
              (entry.status === 'REQUESTED' || entry.status === 'DRAFT') &&
              entry.fillableBy !== 'PROFESSIONAL' && (
                <LinkPanel entryId={entry.id} activeLink={null} />
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryContent({
  entryId,
  timezone,
  onClose,
}: {
  entryId: string;
  timezone: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: access } = useFormAccess();
  const { data, isLoading, error } = useQuery({
    queryKey: ['form-entry', entryId],
    queryFn: () => getEntryDetailAction(entryId).then(unwrapResult),
  });
  const [mode, setMode] = React.useState<'view' | 'edit' | 'correct'>('view');
  const [viewRevision, setViewRevision] = React.useState<number | null>(null);

  if (isLoading) return <p className="text-label-secondary text-[14px]">Carregando…</p>;
  if (error || !data) {
    return (
      <p className="text-system-red text-[14px]">
        {(error as Error)?.message ?? 'Não foi possível abrir.'}
      </p>
    );
  }

  const open = data.status === 'REQUESTED' || data.status === 'DRAFT';
  const editing = (open && access?.canFill) || mode === 'correct';

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
        <Info
          label="Versão do modelo"
          value={`v${data.version.number}${data.version.isCurrent ? '' : ' (anterior)'}`}
        />
        <Info label="Enviada em" value={formatDate(data.submittedAt, timezone, true)} />
        <Info
          label="Preenchida por"
          value={
            data.filledBy === 'CLIENT'
              ? 'Cliente (link)'
              : data.filledBy === 'STAFF'
                ? (data.filledByName ?? 'Equipe')
                : '—'
          }
        />
        {data.reviewedAt && (
          <Info
            label="Revisada"
            value={`${formatDate(data.reviewedAt, timezone, true)} · ${data.reviewedByName ?? 'Equipe'}`}
          />
        )}
        {data.appointmentAt && (
          <Info label="Atendimento" value={formatDate(data.appointmentAt, timezone, true)} />
        )}
        {data.packageName && <Info label="Pacote" value={data.packageName} />}
      </dl>

      {data.version.instructions && editing && (
        <p className="bg-foreground/[0.04] rounded-xl p-3 text-[13px] whitespace-pre-wrap">
          {data.version.instructions}
        </p>
      )}

      {editing ? (
        <EntryEditor
          entryId={entryId}
          schema={data.version.schema}
          initial={data.answers}
          copied={
            data.needsCheck
              ? new Set(
                  Object.keys(data.copiedFrom?.answers ?? {}).filter((k) => k in data.answers),
                )
              : undefined
          }
          correction={mode === 'correct'}
          onDone={() => {
            setMode('view');
            invalidateEntries(queryClient);
          }}
          onCancel={mode === 'correct' ? () => setMode('view') : undefined}
        />
      ) : viewRevision ? (
        <RevisionView
          entryId={entryId}
          revision={viewRevision}
          schema={data.version.schema}
          timezone={timezone}
          onBack={() => setViewRevision(null)}
        />
      ) : (
        <FormRenderer schema={data.version.schema} answers={data.answers} readOnly />
      )}

      {!editing && !viewRevision && (
        <>
          {data.reviewNotes && (
            <div className="rounded-xl bg-amber-500/[0.07] p-3 text-[13px] ring-1 ring-amber-500/25">
              <div className="font-medium">Observação interna da revisão</div>
              <p className="text-label-secondary mt-0.5 text-[12px]">Não aparece para o cliente.</p>
              <p className="mt-1 whitespace-pre-wrap">{data.reviewNotes}</p>
            </div>
          )}
          {data.status === 'SUBMITTED' && access?.canReview && <ReviewPanel entryId={entryId} />}
          <div className="flex flex-wrap gap-2">
            {(data.status === 'SUBMITTED' || data.status === 'REVIEWED') && access?.canFill && (
              <Button variant="outline" size="sm" onClick={() => setMode('correct')}>
                Corrigir respostas
              </Button>
            )}
            {(data.status === 'SUBMITTED' || data.status === 'REVIEWED') && access?.canRequest && (
              <RequestUpdateButton entryId={entryId} onCreated={onClose} />
            )}
            {access?.canExport && data.status !== 'REQUESTED' && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/exportar/ficha/${entryId}`}>
                  <DownloadIcon /> Exportar PDF
                </a>
              </Button>
            )}
          </div>
          {data.revisions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[13px] font-semibold">Revisões das respostas</h3>
              <ul className="flex flex-col gap-1 text-[13px]">
                {data.revisions.map((r) => (
                  <li key={r.revision} className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-system-blue hover:underline"
                      onClick={() => setViewRevision(r.revision)}
                    >
                      Revisão {r.revision}
                    </button>
                    <span className="text-label-secondary">
                      {formatDate(r.submittedAt, timezone, true)} ·{' '}
                      {r.filledBy === 'CLIENT' ? 'cliente' : 'equipe'}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {access?.canAudit && <AuditList entryId={entryId} timezone={timezone} />}
        </>
      )}

      {open && access?.canRequest && data.version.fillableBy !== 'PROFESSIONAL' && (
        <LinkPanel entryId={entryId} activeLink={data.activeLink} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label-secondary text-[12px]">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function EntryEditor({
  entryId,
  schema,
  initial,
  copied,
  correction,
  onDone,
  onCancel,
}: {
  entryId: string;
  schema: FormSchema;
  initial: Answers;
  copied?: Set<string>;
  correction: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [answers, setAnswers] = React.useState<Answers>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const autosave = useAutosave((value: Answers) =>
    saveEntryDraftAction({ id: entryId, answers: value }).then(unwrapResult),
  );

  const submit = useMutation({
    mutationFn: () =>
      submitEntryAction({
        id: entryId,
        answers,
        reason: correction ? reason : undefined,
        confirmCopied: copied ? confirmed : undefined,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success(correction ? 'Correção salva como nova revisão.' : 'Ficha enviada.');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function change(id: string, value: unknown) {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (errors[id])
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    if (!correction) autosave.schedule(next);
  }

  function trySubmit() {
    const result = validateAnswers(schema, answers, { mode: 'submit', audience: 'staff' });
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      toast.error('Confira as perguntas destacadas.');
      document.getElementById(`e-${Object.keys(result.errors)[0]}`)?.focus();
      return;
    }
    autosave.cancel();
    submit.mutate();
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        trySubmit();
      }}
      noValidate
    >
      {copied && copied.size > 0 && (
        <p className="rounded-xl bg-amber-500/[0.07] p-3 text-[13px] ring-1 ring-amber-500/25">
          Esta atualização começou com as respostas da ficha anterior. As marcadas precisam ser
          conferidas com o cliente antes do envio.
        </p>
      )}
      <FormRenderer
        schema={schema}
        answers={answers}
        onChange={change}
        errors={errors}
        copiedIds={copied}
        idPrefix="e"
      />
      {correction && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="correction-reason" className="text-[14px] font-medium">
            Motivo da correção
          </label>
          <Input
            id="correction-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: cliente informou um dado diferente"
          />
          <p className="text-label-secondary text-[12px]">
            A versão anterior das respostas continua guardada.
          </p>
        </div>
      )}
      {copied && copied.size > 0 && (
        <label className="flex items-start gap-2 text-[14px]">
          <input
            type="checkbox"
            className="accent-system-blue mt-1 size-4"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Conferi as respostas copiadas com o cliente.
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={
            submit.isPending ||
            (correction && reason.trim().length < 3) ||
            (!!copied?.size && !confirmed)
          }
        >
          {submit.isPending ? 'Enviando…' : correction ? 'Salvar correção' : 'Enviar ficha'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {!correction && <AutosaveText status={autosave.status} onRetry={autosave.retry} />}
      </div>
    </form>
  );
}

function RevisionView({
  entryId,
  revision,
  schema,
  timezone,
  onBack,
}: {
  entryId: string;
  revision: number;
  schema: FormSchema;
  timezone: string;
  onBack: () => void;
}) {
  const { data, error } = useQuery({
    queryKey: ['form-entry', entryId, 'revision', revision],
    queryFn: () => getEntryRevisionAction({ id: entryId, revision }).then(unwrapResult),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">
          Revisão {revision}
          {data ? ` · ${formatDate(data.submittedAt, timezone, true)}` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Voltar para a atual
        </Button>
      </div>
      {error && <p className="text-system-red text-[13px]">{(error as Error).message}</p>}
      {data && <FormRenderer schema={schema} answers={data.answers} readOnly />}
    </div>
  );
}

function ReviewPanel({ entryId }: { entryId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState('');
  const review = useMutation({
    mutationFn: () => reviewEntryAction({ id: entryId, notes: notes || null }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Ficha revisada.');
      invalidateEntries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="bg-foreground/[0.03] flex flex-col gap-2 rounded-xl p-3">
      <label htmlFor="review-notes" className="text-[13px] font-semibold">
        Revisar
      </label>
      <Textarea
        id="review-notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação interna (opcional) — não aparece para o cliente"
      />
      <p className="text-label-secondary text-[12px]">
        A revisão registra quem conferiu e quando. Não é autorização automática para nenhum
        procedimento.
      </p>
      <Button
        size="sm"
        className="self-start"
        disabled={review.isPending}
        onClick={() => review.mutate()}
      >
        Marcar como revisada
      </Button>
    </div>
  );
}

function RequestUpdateButton({ entryId, onCreated }: { entryId: string; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const request = useMutation({
    mutationFn: () => requestEntryUpdateAction(entryId).then(unwrapResult),
    onSuccess: ({ created }) => {
      toast.success(
        created
          ? 'Atualização pedida: abra a ficha nova na lista para conferir e enviar.'
          : 'Já existe uma atualização em aberto para esta ficha.',
      );
      invalidateEntries(queryClient);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={request.isPending}
      onClick={() => request.mutate()}
    >
      Pedir atualização
    </Button>
  );
}

/** Gerar link para o cliente: só "Copiar" — nada é enviado automaticamente. */
function LinkPanel({
  entryId,
  activeLink,
}: {
  entryId: string;
  activeLink: { expiresAt: Date | string } | null;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = React.useState<{ url: string; expiresAt: string } | null>(null);
  const create = useMutation({
    mutationFn: () => createEntryLinkAction(entryId).then(unwrapResult),
    onSuccess: (result) => {
      setUrl(result);
      invalidateEntries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeEntryLinksAction(entryId).then(unwrapResult),
    onSuccess: () => {
      setUrl(null);
      toast.success('Link revogado.');
      invalidateEntries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const expires = url?.expiresAt ?? activeLink?.expiresAt ?? null;
  return (
    <div className="bg-foreground/[0.03] flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <LinkIcon className="size-4" /> Link para o cliente preencher
      </div>
      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={url.url}
            onFocus={(e) => e.target.select()}
            aria-label="Link da ficha"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigator.clipboard
                .writeText(url.url)
                .then(() => toast.success('Link copiado.'))
                .catch(() => toast.error('Não foi possível copiar. Selecione e copie o link.'))
            }
          >
            <CopyIcon /> Copiar link
          </Button>
        </div>
      ) : (
        <p className="text-label-secondary text-[12px]">
          {activeLink
            ? 'Há um link ativo. Por segurança ele não é mostrado de novo: gere outro (o anterior deixa de valer).'
            : 'O link vale para esta ficha, expira em 7 dias e para de funcionar depois do envio.'}
        </p>
      )}
      {expires && (
        <p className="text-label-secondary text-[12px]">
          Expira em{' '}
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(expires),
          )}
          .
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {activeLink || url ? 'Gerar novo link' : 'Gerar link'}
        </Button>
        {(activeLink || url) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            Revogar link
          </Button>
        )}
      </div>
    </div>
  );
}

function AuditList({ entryId, timezone }: { entryId: string; timezone: string }) {
  const [show, setShow] = React.useState(false);
  const { data } = useQuery({
    queryKey: ['form-entry', entryId, 'audit'],
    queryFn: () => listEntryAuditAction(entryId).then(unwrapResult),
    enabled: show,
  });
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="text-system-blue self-start text-[13px] hover:underline"
        aria-expanded={show}
        onClick={() => setShow((v) => !v)}
      >
        {show ? 'Ocultar histórico de acesso' : 'Ver histórico de acesso'}
      </button>
      {show && (
        <ul className="text-label-secondary flex flex-col gap-0.5 text-[12px]">
          {(data ?? []).map((row) => (
            <li key={row.id}>
              {formatDate(row.createdAt, timezone, true)} · {row.action} · {row.actor}
            </li>
          ))}
          {data?.length === 0 && <li>Sem registros.</li>}
        </ul>
      )}
    </div>
  );
}
