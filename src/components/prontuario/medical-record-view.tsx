'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  FilePenLineIcon,
  HistoryIcon,
  IdCardIcon,
  MessageCircleIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Surface } from '@/components/layout/page';
import { ClientFormsTab } from '@/components/fichas/client-forms-tab';
import { ClientRecordsTab } from '@/components/clientes/client-records-tab';
import { ClientSessionsTab } from '@/components/pacotes/client-sessions-tab';
import { TreatmentPlanTab, type PlanQuoteView } from '@/components/prontuario/treatment-plan-tab';
import { DocumentsTab } from '@/components/prontuario/documents-tab';
import { AttachmentsTab } from '@/components/prontuario/attachments-tab';
import { AiSummary } from '@/components/prontuario/ai-summary';
import { unwrapResult } from '@/lib/action-result';
import { ageOn } from '@/lib/medical-records';
import { formatPhone, whatsappLink } from '@/lib/phone';
import { cn } from '@/lib/utils';
import {
  updateInsuranceAction,
  addClinicalNoteAction,
  getMedicalRecordAction,
} from '@/server/actions/medical-record-actions';

type Tab = 'evolucao' | 'plano' | 'documentos' | 'anamnese' | 'anexos' | 'registros' | 'sessoes';

/** Convênio do paciente no cabeçalho, com edição rápida. */
function InsuranceLine({
  clientId,
  name,
  number,
  plan,
}: {
  clientId: string;
  name: string | null;
  number: string | null;
  plan: string | null;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: name ?? '',
    number: number ?? '',
    plan: plan ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      updateInsuranceAction({
        clientId,
        name: form.name || null,
        number: form.number || null,
        plan: form.plan || null,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Convênio salvo.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['medical-record', clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!editing) {
    return (
      <p className="text-label-secondary flex flex-wrap items-center gap-1.5 text-[12px]">
        <IdCardIcon className="size-3.5" />
        {name ? (
          <>
            Convênio: <strong className="text-foreground">{name}</strong>
            {plan ? ` · ${plan}` : ''}
            {number ? ` · carteirinha ${number}` : ''}
          </>
        ) : (
          'Particular (sem convênio)'
        )}
        <button
          type="button"
          className="text-system-blue ml-1 hover:underline"
          onClick={() => {
            setForm({ name: name ?? '', number: number ?? '', plan: plan ?? '' });
            setEditing(true);
          }}
        >
          {name ? 'Editar' : 'Informar convênio'}
        </button>
      </p>
    );
  }
  return (
    <form
      className="bg-foreground/[0.03] grid gap-2 rounded-xl p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Input
        placeholder="Convênio (ex.: Unimed)"
        value={form.name}
        maxLength={80}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        aria-label="Nome do convênio"
      />
      <Input
        placeholder="Plano"
        value={form.plan}
        maxLength={80}
        onChange={(e) => setForm({ ...form, plan: e.target.value })}
        aria-label="Plano do convênio"
      />
      <Input
        placeholder="Nº da carteirinha"
        value={form.number}
        maxLength={40}
        onChange={(e) => setForm({ ...form, number: e.target.value })}
        aria-label="Número da carteirinha"
      />
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

/**
 * Prontuário do paciente: cabeçalho com alertas da anamnese, próxima consulta e retorno; a
 * evolução (que não se apaga, só se retifica) e, nas outras abas, o que já existe no sistema
 * (fichas, registros com fotos e sessões).
 */
export function MedicalRecordView({
  clientId,
  timezone,
  formsEnabled,
}: {
  clientId: string;
  timezone: string;
  formsEnabled: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>('evolucao');
  const { data, error } = useQuery({
    queryKey: ['medical-record', clientId],
    queryFn: () => getMedicalRecordAction(clientId).then(unwrapResult),
  });

  if (error) return <p className="text-system-red text-[14px]">{(error as Error).message}</p>;
  if (!data) return <Skeleton className="h-[480px] rounded-[22px]" />;

  const { client } = data;
  const age = ageOn(client.birthDate);
  const dateTime = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(d));
  const date = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(d));
  const chat = whatsappLink(client.phone);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/clientes/${clientId}`}>
            <ArrowLeftIcon /> Ficha do cliente
          </Link>
        </Button>
        <span className="text-label-secondary text-[12px]">
          Prontuário · {data.notesCount} {data.notesCount === 1 ? 'evolução' : 'evoluções'}
        </span>
      </div>

      {/* Cabeçalho do paciente */}
      <Surface className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="bg-system-blue/12 text-system-blue flex size-14 shrink-0 items-center justify-center rounded-full text-[20px] font-bold">
            {client.name.trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] leading-tight font-bold tracking-[-0.02em] md:text-[26px]">
              {client.name}
            </h1>
            <p className="text-label-secondary text-[13px]">
              {[
                client.birthDate
                  ? `${date(client.birthDate)}${age !== null ? ` · ${age} anos` : ''}`
                  : null,
                client.phone ? formatPhone(client.phone) : null,
                `Paciente desde ${new Date(client.createdAt).toLocaleDateString('pt-BR')}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {chat && (
              <Button variant="outline" size="sm" asChild>
                <a href={chat} target="_blank" rel="noreferrer">
                  <MessageCircleIcon /> WhatsApp
                </a>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href={`/agenda?cliente=${clientId}`}>
                <CalendarDaysIcon /> Agendar
              </Link>
            </Button>
          </div>
        </div>

        {/* Alertas e avisos */}
        <div className="flex flex-col gap-1.5">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className="bg-system-red/[0.08] flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]"
            >
              <AlertTriangleIcon className="text-system-red mt-0.5 size-4 shrink-0" />
              <span>
                <strong>{a.label}:</strong> {a.detail}
                <span className="text-label-secondary">
                  {' '}
                  · {a.formName}
                  {a.answeredAt ? ` (${new Date(a.answeredAt).toLocaleDateString('pt-BR')})` : ''}
                </span>
              </span>
            </div>
          ))}
          {data.nextAppointment && (
            <div className="bg-system-blue/[0.07] flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]">
              <CalendarDaysIcon className="text-system-blue mt-0.5 size-4 shrink-0" />
              <span>
                Próxima consulta: <strong>{dateTime(data.nextAppointment.startAt)}</strong> ·{' '}
                {data.nextAppointment.serviceName} com {data.nextAppointment.professionalName}
              </span>
            </div>
          )}
          {data.returnSuggestion && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]',
                data.returnSuggestion.daysLate > 0 ? 'bg-system-orange/10' : 'bg-foreground/[0.04]',
              )}
            >
              <CalendarClockIcon className="text-system-orange mt-0.5 size-4 shrink-0" />
              <span>
                Retorno de {data.returnSuggestion.serviceName}:{' '}
                <strong>{date(data.returnSuggestion.dueAt)}</strong>
                {data.returnSuggestion.daysLate > 0
                  ? ` · atrasado ${data.returnSuggestion.daysLate} ${data.returnSuggestion.daysLate === 1 ? 'dia' : 'dias'}`
                  : ''}
              </span>
            </div>
          )}
          {data.alerts.length === 0 && formsEnabled && (
            <p className="text-label-secondary text-[12px]">
              Sem alertas da anamnese. Para ver alergias e medicamentos aqui, marque as perguntas
              como &quot;Alerta no prontuário&quot; no modelo, em Fichas.
            </p>
          )}
          {client.notes && (
            <p className="text-label-secondary text-[12px]">
              Observações do cadastro: {client.notes}
            </p>
          )}
          <InsuranceLine
            clientId={clientId}
            name={client.insuranceName}
            number={client.insuranceNumber}
            plan={client.insurancePlan}
          />
        </div>
      </Surface>

      <AiSummary clientId={clientId} />

      <SegmentedControl
        className="self-start"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'evolucao', label: 'Evolução' },
          {
            value: 'plano',
            label: data.pendingSessions
              ? `Plano de tratamento · ${data.pendingSessions}`
              : 'Plano de tratamento',
          },
          { value: 'documentos', label: 'Documentos' },
          { value: 'anamnese', label: 'Anamnese e termos' },
          { value: 'anexos', label: 'Anexos' },
          { value: 'registros', label: 'Registros e fotos' },
          { value: 'sessoes', label: 'Sessões' },
        ]}
      />

      {tab === 'evolucao' && (
        <Evolution
          clientId={clientId}
          notes={data.notes}
          templates={data.templates}
          plan={data.plan}
          when={dateTime}
        />
      )}
      {tab === 'plano' && <TreatmentPlanTab clientId={clientId} plan={data.plan} when={dateTime} />}
      {tab === 'anamnese' &&
        (formsEnabled ? (
          <ClientFormsTab clientId={clientId} clientName={client.name} timezone={timezone} />
        ) : (
          <p className="text-label-secondary text-[14px]">
            Anamnese, termos e assinatura pelo celular estão no plano Profissional.{' '}
            <Link href="/fichas" className="text-system-blue underline">
              Testar grátis
            </Link>
          </p>
        ))}
      {tab === 'documentos' && (
        <DocumentsTab clientId={clientId} patientName={client.name} timezone={timezone} />
      )}
      {tab === 'anexos' && <AttachmentsTab clientId={clientId} timezone={timezone} />}
      {tab === 'registros' && <ClientRecordsTab clientId={clientId} clientName={client.name} />}
      {tab === 'sessoes' && <ClientSessionsTab clientId={clientId} timezone={timezone} />}
    </div>
  );
}

type Note = {
  id: string;
  text: string;
  createdAt: Date | string;
  authorName: string;
  amendsId: string | null;
  amendedAt: Date | string | null;
};

function Evolution({
  clientId,
  notes,
  templates,
  plan,
  when,
}: {
  clientId: string;
  notes: Note[];
  templates: { key: string; label: string; text: string }[];
  plan: PlanQuoteView[];
  when: (d: Date | string) => string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = React.useState('');
  const [amending, setAmending] = React.useState<Note | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  /** Procedimentos do plano feitos neste atendimento ("quoteId:índice"). */
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set());
  const composer = React.useRef<HTMLTextAreaElement>(null);
  const pendingItems = plan.flatMap((q) =>
    q.items
      .filter((i) => !i.viaPackage && i.done < i.total)
      .map((i) => ({ ...i, key: `${i.quoteId}:${i.itemIndex}`, quoteNumber: q.number })),
  );

  const save = useMutation({
    mutationFn: () =>
      addClinicalNoteAction({
        clientId,
        text,
        amendsId: amending?.id ?? null,
        procedures: amending
          ? []
          : pendingItems
              .filter((i) => checked.has(i.key))
              .map((i) => ({ quoteId: i.quoteId, itemIndex: i.itemIndex })),
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success(
        amending
          ? 'Retificação salva.'
          : checked.size
            ? `Evolução salva e ${checked.size} ${checked.size === 1 ? 'sessão marcada' : 'sessões marcadas'} no plano.`
            : 'Evolução salva.',
      );
      setText('');
      setAmending(null);
      setConfirm(false);
      setChecked(new Set());
      queryClient.invalidateQueries({ queryKey: ['medical-record', clientId] });
    },
    onError: (e: Error) => {
      setConfirm(false);
      toast.error(e.message);
    },
  });

  const startAmend = (note: Note) => {
    setAmending(note);
    setText(note.text);
    requestAnimationFrame(() => composer.current?.focus());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <FilePenLineIcon className="text-system-blue size-4" />
            {amending ? 'Retificar evolução' : 'Nova evolução'}
          </h2>
          {!amending && (
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <Button
                  key={t.key}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setText((current) =>
                      current.trim() ? `${current.trimEnd()}\n\n${t.text}` : t.text,
                    );
                    composer.current?.focus();
                  }}
                >
                  Modelo: {t.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        {amending && (
          <p className="text-label-secondary text-[12px]">
            A evolução de {when(amending.createdAt)} continua no prontuário, marcada como
            retificada. Esta nova versão fica logo acima dela.
          </p>
        )}
        <Textarea
          ref={composer}
          rows={8}
          value={text}
          maxLength={20_000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Descreva o atendimento: queixa, avaliação, procedimento, orientações..."
          aria-label="Texto da evolução"
        />
        {!amending && pendingItems.length > 0 && (
          <fieldset className="bg-foreground/[0.03] flex flex-col gap-1.5 rounded-xl p-3">
            <legend className="text-[12px] font-medium">
              Procedimentos do plano feitos neste atendimento
            </legend>
            {pendingItems.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--system-blue)]"
                  checked={checked.has(item.key)}
                  onChange={(e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(item.key);
                    else next.delete(item.key);
                    setChecked(next);
                  }}
                />
                <span className="min-w-0 flex-1">{item.description}</span>
                <span className="text-label-secondary text-[12px] tabular-nums">
                  sessão {item.done + 1} de {item.total} · orç. #{item.quoteNumber}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-label-secondary text-[12px]">
            Depois de salva, a evolução não pode ser apagada. Para corrigir, use Retificar.
          </span>
          <div className="flex gap-2">
            {(amending || text) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAmending(null);
                  setText('');
                }}
              >
                Cancelar
              </Button>
            )}
            <Button
              size="sm"
              disabled={text.trim().length < 3 || save.isPending}
              onClick={() => setConfirm(true)}
            >
              {amending ? 'Salvar retificação' : 'Salvar evolução'}
            </Button>
          </div>
        </div>
      </Surface>

      {notes.length === 0 ? (
        <p className="text-label-secondary py-6 text-center text-[14px]">
          Nenhuma evolução ainda. A primeira fica registrada com data, hora e quem escreveu.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Surface className={cn('flex flex-col gap-2 p-4', note.amendedAt && 'opacity-60')}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span>
                    <strong>{when(note.createdAt)}</strong>
                    <span className="text-label-secondary"> · {note.authorName}</span>
                    {note.amendsId && (
                      <span className="bg-system-blue/10 text-system-blue ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        Retificação
                      </span>
                    )}
                    {note.amendedAt && (
                      <span className="bg-foreground/[0.06] text-label-secondary ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        <HistoryIcon className="size-3" /> Retificada em {when(note.amendedAt)}
                      </span>
                    )}
                  </span>
                  {!note.amendedAt && (
                    <Button variant="ghost" size="xs" onClick={() => startAmend(note)}>
                      <RotateCcwIcon /> Retificar
                    </Button>
                  )}
                </div>
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{note.text}</p>
              </Surface>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={amending ? 'Salvar a retificação?' : 'Salvar a evolução?'}
        description="Ela fica no prontuário com data, hora e o seu nome, e não pode ser apagada depois."
        confirmLabel="Salvar"
        pending={save.isPending}
        onConfirm={() => save.mutate()}
      />
    </div>
  );
}
