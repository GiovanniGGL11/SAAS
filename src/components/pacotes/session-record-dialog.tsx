'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadIcon, PenLineIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { SIGNATURE_STATEMENT } from '@/lib/packages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { STATUS_LABELS } from '@/components/agenda/status';
import { useFormAccess } from '@/components/fichas/entry-dialog';
import { RECORD_STATUS_LABEL, SIGNATURE_LABEL, formatDate } from '@/components/fichas/labels';
import {
  SignaturePad,
  type Stroke,
  hasInk,
  strokesToPng,
} from '@/components/pacotes/signature-pad';
import {
  finalizeSessionRecordAction,
  getSessionRecordAction,
  saveSessionRecordAction,
  signSessionRecordAction,
} from '@/server/actions/package-actions';

type RecordData =
  Awaited<ReturnType<typeof getSessionRecordAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ['session-record', 'client-sessions', 'client-packages-detail']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Registro de um atendimento (sessão de pacote ou avulso). Três status independentes:
 * atendimento, registro e assinatura. Depois de finalizado, mudar é por adendo (versão nova).
 */
export function SessionRecordDialog({
  appointmentId,
  open,
  onOpenChange,
  timezone,
}: {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {appointmentId && (
          <RecordContent key={appointmentId} appointmentId={appointmentId} timezone={timezone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordContent({ appointmentId, timezone }: { appointmentId: string; timezone: string }) {
  const { data: access } = useFormAccess();
  const { data, isLoading, error } = useQuery({
    queryKey: ['session-record', appointmentId],
    queryFn: () => getSessionRecordAction(appointmentId).then(unwrapResult),
  });
  const [step, setStep] = React.useState<'view' | 'edit' | 'amend' | 'sign'>('view');

  if (isLoading || !data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Registro do atendimento</DialogTitle>
        </DialogHeader>
        <p className={error ? 'text-system-red text-[14px]' : 'text-label-secondary text-[14px]'}>
          {error ? (error as Error).message : 'Carregando…'}
        </p>
      </>
    );
  }

  const record = data.record;
  const current = record?.versions.find((v) => v.version === record.currentVersion) ?? null;
  const canFill = !!access?.canFill && data.canSeeContent;
  const blockedStatus =
    data.appointment.status === 'CANCELED' || data.appointment.status === 'NO_SHOW';
  const title = data.package?.sessionNumber
    ? `Sessão ${data.package.sessionNumber} de ${data.package.sessionsTotal}`
    : data.package
      ? `Sessão do pacote (será numerada ao concluir)`
      : 'Registro do atendimento';

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">{title}</DialogTitle>
        <DialogDescription>
          {data.appointment.clientName} · {data.appointment.serviceName} ·{' '}
          {formatDate(data.appointment.startAt, timezone, true)} ·{' '}
          {data.appointment.professionalName}
          {data.package ? ` · ${data.package.name}` : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5">
        <StatusChip>Atendimento: {STATUS_LABELS[data.appointment.status]}</StatusChip>
        <StatusChip>{record ? RECORD_STATUS_LABEL[record.status] : 'Sem registro'}</StatusChip>
        <StatusChip
          tone={
            record?.signature === 'pending' || (!record && data.requireSignature)
              ? 'amber'
              : undefined
          }
        >
          {record
            ? SIGNATURE_LABEL[record.signature]
            : data.requireSignature
              ? 'Assinatura exigida'
              : 'Assinatura opcional'}
        </StatusChip>
      </div>
      {data.appointment.status === 'DONE' && record?.signature === 'pending' && (
        <p className="text-[13px] text-amber-800 dark:text-amber-300">
          Realizada — assinatura pendente.
        </p>
      )}

      {!data.canSeeContent ? (
        <p className="text-label-secondary text-[14px]">
          Você acompanha o status deste registro, mas não tem permissão para ver o conteúdo.
        </p>
      ) : step === 'edit' || step === 'amend' || (!record && canFill && !blockedStatus) ? (
        <RecordEditor
          appointmentId={appointmentId}
          initial={current?.content ?? null}
          amend={step === 'amend'}
          onDone={() => setStep('view')}
          onCancel={record ? () => setStep('view') : undefined}
        />
      ) : step === 'sign' && current?.content ? (
        <SignStep
          appointmentId={appointmentId}
          version={current.version}
          contentHash={current.contentHash}
          content={current.content}
          defaultName={data.appointment.clientName}
          onDone={() => setStep('view')}
          onCancel={() => setStep('view')}
        />
      ) : record && current?.content ? (
        <div className="flex flex-col gap-4">
          <ContentView content={current.content} />
          <div className="flex flex-wrap gap-2">
            {canFill && record.signature !== 'signed' && (
              <Button onClick={() => setStep('sign')}>
                <PenLineIcon /> Coletar assinatura
              </Button>
            )}
            {canFill && record.status === 'DRAFT' && record.signature !== 'signed' && (
              <Button variant="outline" onClick={() => setStep('edit')}>
                Editar registro
              </Button>
            )}
            {canFill && record.status === 'DRAFT' && (
              <FinalizeButton
                appointmentId={appointmentId}
                disabled={record.signature === 'pending'}
              />
            )}
            {canFill && record.status !== 'DRAFT' && (
              <Button variant="outline" onClick={() => setStep('amend')}>
                Adicionar adendo
              </Button>
            )}
            {access?.canExport && (
              <Button variant="outline" asChild>
                <a href={`/exportar/sessao/${appointmentId}`}>
                  <DownloadIcon /> PDF
                </a>
              </Button>
            )}
          </div>
          {record.status === 'DRAFT' && record.signature === 'pending' && (
            <p className="text-label-secondary text-[12px]">
              Este pacote exige a assinatura do cliente antes de finalizar o registro.
            </p>
          )}
          <VersionsList
            versions={record.versions}
            currentVersion={record.currentVersion}
            timezone={timezone}
          />
        </div>
      ) : (
        <p className="text-label-secondary text-[14px]">
          {blockedStatus
            ? 'Atendimento cancelado ou falta: não há sessão para registrar.'
            : 'Ainda sem registro.'}
        </p>
      )}
    </>
  );
}

function StatusChip({ children, tone }: { children: React.ReactNode; tone?: 'amber' }) {
  return (
    <span
      className={
        tone === 'amber'
          ? 'inline-flex h-6 items-center rounded-full bg-amber-500/15 px-2.5 text-[12px] font-medium text-amber-800 dark:text-amber-300'
          : 'bg-foreground/[0.06] text-label-secondary inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium'
      }
    >
      {children}
    </span>
  );
}

type Content = NonNullable<NonNullable<RecordData['record']>['versions'][number]['content']>;

function ContentView({
  content,
  showInternal = true,
}: {
  content: Content;
  showInternal?: boolean;
}) {
  return (
    <dl className="flex flex-col gap-3 text-[14px]">
      <Field label="Procedimento realizado" value={content.procedure} />
      {content.clientReport && (
        <Field label="Relato do cliente / evolução" value={content.clientReport} />
      )}
      {content.orientations && <Field label="Orientações" value={content.orientations} />}
      {content.nextReturn && <Field label="Próximo retorno" value={content.nextReturn} />}
      {showInternal && content.internalNotes && (
        <div className="rounded-xl bg-amber-500/[0.07] p-3 ring-1 ring-amber-500/25">
          <dt className="text-[12px] font-medium">
            Observações internas (não aparecem para o cliente nem entram na assinatura)
          </dt>
          <dd className="mt-1 whitespace-pre-wrap">{content.internalNotes}</dd>
        </div>
      )}
    </dl>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label-secondary text-[12px]">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function RecordEditor({
  appointmentId,
  initial,
  amend,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  initial: Content | null;
  amend: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    procedure: initial?.procedure ?? '',
    clientReport: initial?.clientReport ?? '',
    orientations: initial?.orientations ?? '',
    nextReturn: initial?.nextReturn ?? '',
    internalNotes: initial?.internalNotes ?? '',
  });
  const [reason, setReason] = React.useState('');
  const save = useMutation({
    mutationFn: () =>
      saveSessionRecordAction({
        appointmentId,
        ...form,
        amendmentReason: amend ? reason : undefined,
      }).then(unwrapResult),
    onSuccess: ({ version }) => {
      toast.success(
        amend
          ? `Adendo salvo (versão ${version}). Peça nova assinatura se for exigida.`
          : 'Registro salvo.',
      );
      invalidate(queryClient);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {amend && (
        <p className="text-label-secondary text-[13px]">
          O registro já foi finalizado. O adendo cria uma versão nova; a versão anterior (e a
          assinatura dela) continua guardada.
        </p>
      )}
      <LabeledText
        id="rec-procedure"
        label="Procedimento realizado *"
        value={form.procedure}
        onChange={set('procedure')}
        rows={3}
      />
      <LabeledText
        id="rec-report"
        label="Relato do cliente, evolução e intercorrências relatadas"
        value={form.clientReport}
        onChange={set('clientReport')}
        rows={3}
      />
      <LabeledText
        id="rec-orient"
        label="Orientações fornecidas"
        value={form.orientations}
        onChange={set('orientations')}
        rows={2}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rec-return" className="text-[14px] font-medium">
          Próximo retorno
        </label>
        <Input
          id="rec-return"
          value={form.nextReturn}
          onChange={set('nextReturn')}
          placeholder="Ex.: em 15 dias"
          maxLength={300}
        />
      </div>
      <LabeledText
        id="rec-internal"
        label="Observações internas (não aparecem para o cliente e não entram na assinatura)"
        value={form.internalNotes}
        onChange={set('internalNotes')}
        rows={2}
      />
      {amend && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rec-reason" className="text-[14px] font-medium">
            Motivo do adendo *
          </label>
          <Input id="rec-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={save.isPending || !form.procedure.trim() || (amend && reason.trim().length < 3)}
        >
          {amend ? 'Salvar adendo' : 'Salvar registro'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function LabeledText({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={onChange}
        maxLength={5000}
        className="text-[16px] md:text-sm"
      />
    </div>
  );
}

function FinalizeButton({ appointmentId, disabled }: { appointmentId: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const finalize = useMutation({
    mutationFn: () => finalizeSessionRecordAction(appointmentId).then(unwrapResult),
    onSuccess: () => {
      toast.success('Registro finalizado.');
      invalidate(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      variant="outline"
      disabled={disabled || finalize.isPending}
      onClick={() => finalize.mutate()}
    >
      Finalizar registro
    </Button>
  );
}

/**
 * Coleta da assinatura: o cliente vê exatamente o conteúdo e a declaração que confirma, digita o
 * nome e assina. A assinatura fica presa a esta versão (pelo hash do conteúdo).
 */
function SignStep({
  appointmentId,
  version,
  contentHash,
  content,
  defaultName,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  version: number;
  contentHash: string;
  content: Content;
  defaultName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(defaultName);
  const [strokes, setStrokes] = React.useState<Stroke[]>([]);
  const sign = useMutation({
    mutationFn: () =>
      signSessionRecordAction({
        appointmentId,
        version,
        contentHash,
        signerName: name,
        image: strokesToPng(strokes),
        strokes: strokes.length,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Assinatura registrada.');
      invalidate(queryClient);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ink = hasInk(strokes);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-label-secondary text-[13px]">
        Entregue o aparelho ao cliente. A assinatura é do cliente — a equipe não assina por ele.
      </p>
      <div className="bg-foreground/[0.03] rounded-xl p-3">
        <div className="text-label-secondary mb-2 text-[12px]">
          Conteúdo que você está confirmando (versão {version})
        </div>
        <ContentView content={content} showInternal={false} />
      </div>
      <p className="text-[14px] font-medium">{SIGNATURE_STATEMENT}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signer-name" className="text-[14px] font-medium">
          Seu nome
        </label>
        <Input
          id="signer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium">Assine no quadro abaixo</span>
        <SignaturePad strokes={strokes} onChange={setStrokes} />
        {!ink && strokes.length > 0 && (
          <p className="text-system-red text-[12px]">
            A assinatura está muito curta. Assine de novo.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!ink || name.trim().length < 2 || sign.isPending}
          onClick={() => sign.mutate()}
        >
          Confirmar assinatura
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function VersionsList({
  versions,
  currentVersion,
  timezone,
}: {
  versions: NonNullable<RecordData['record']>['versions'];
  currentVersion: number;
  timezone: string;
}) {
  if (versions.length <= 1 && !versions[0]?.signature) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold">Versões e assinaturas</h3>
      <ul className="flex flex-col gap-3">
        {versions.map((v) => (
          <li
            key={v.version}
            className="bg-foreground/[0.03] flex flex-col gap-1 rounded-xl p-3 text-[13px]"
          >
            <div className="font-medium">
              Versão {v.version}
              {v.version === currentVersion ? ' (atual)' : ''} ·{' '}
              {formatDate(v.createdAt, timezone, true)}
            </div>
            {v.amendmentReason && (
              <div className="text-label-secondary">Adendo: {v.amendmentReason}</div>
            )}
            {v.version !== currentVersion && v.content && (
              <details>
                <summary className="text-system-blue cursor-pointer">
                  Ver conteúdo desta versão
                </summary>
                <div className="mt-2">
                  <ContentView content={v.content} />
                </div>
              </details>
            )}
            {v.signature ? (
              <div className="flex flex-col gap-1">
                {v.signature.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem em data URL, sem otimização
                  <img
                    src={v.signature.image}
                    alt={`Assinatura da versão ${v.version}`}
                    className="h-16 w-auto self-start rounded bg-white ring-1 ring-black/10"
                  />
                )}
                <span className="text-label-secondary">
                  Assinado por {v.signature.signerName ?? '—'} em{' '}
                  {formatDate(v.signature.signedAt, timezone, true)} (desenho no aparelho; não é
                  assinatura digital certificada)
                </span>
              </div>
            ) : (
              <span className="text-label-secondary">Sem assinatura nesta versão.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
