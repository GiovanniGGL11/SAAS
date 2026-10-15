'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardListIcon, FileTextIcon, PlusIcon, SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { ENTRY_STATUS_LABEL, FORM_TYPE_LABEL } from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/page';
import { FormRenderer } from '@/components/fichas/form-renderer';
import { EntryDialog, type EntrySummary, useFormAccess } from '@/components/fichas/entry-dialog';
import { EntryStatusBadge, FlagBadge } from '@/components/fichas/entry-status-badge';
import {
  FILLER_LABEL,
  REQUIREMENT_LABEL,
  RENEWAL_LABEL,
  formatDate,
} from '@/components/fichas/labels';
import {
  createStarterAnamnesisAction,
  duplicateTemplateAction,
  getFormsSettingsAction,
  getTemplateAction,
  listEntriesAction,
  listFormPermissionsAction,
  listTemplatesAction,
  setFormPermissionAction,
  setFormsPrivacyNoticeAction,
  setTemplateArchivedAction,
} from '@/server/actions/form-actions';

type Tab = 'modelos' | 'preenchimentos' | 'acesso';

export function FormsHome({ timezone, initialTab }: { timezone: string; initialTab?: string }) {
  const { data: access } = useFormAccess();
  const [tab, setTab] = React.useState<Tab>(
    initialTab === 'preenchimentos' || initialTab === 'acesso' ? initialTab : 'modelos',
  );
  const tabs: { value: Tab; label: string }[] = [
    { value: 'modelos', label: 'Modelos' },
    { value: 'preenchimentos', label: 'Preenchimentos' },
    ...(access?.canGrant ? [{ value: 'acesso' as const, label: 'Acesso e privacidade' }] : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fichas e formulários"
        description="Anamneses, avaliações e formulários por serviço, com histórico de cada envio."
        actions={
          access?.canManage && tab === 'modelos' ? (
            <Button asChild>
              <Link href="/fichas/modelos/novo">
                <PlusIcon /> Novo modelo
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SegmentedControl
        className="self-start"
        value={tab}
        onValueChange={(next) => {
          setTab(next);
          const url = new URL(window.location.href);
          url.searchParams.set('aba', next);
          window.history.replaceState(null, '', url);
        }}
        options={tabs}
      />
      {tab === 'modelos' && <TemplatesTab canManage={!!access?.canManage} />}
      {tab === 'preenchimentos' && <EntriesTab timezone={timezone} />}
      {tab === 'acesso' && access?.canGrant && <AccessTab />}
    </div>
  );
}

// ---- Modelos ------------------------------------------------------------------------------------

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = React.useState(false);
  const { data: templates, isLoading } = useQuery({
    queryKey: ['form-templates', showArchived],
    queryFn: () => listTemplatesAction({ includeArchived: showArchived }),
  });
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [archiving, setArchiving] = React.useState<{ id: string; name: string } | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['form-templates'] });

  const starter = useMutation({
    mutationFn: () => createStarterAnamnesisAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Modelo inicial criado. Revise as perguntas antes de usar.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateTemplateAction(id).then(unwrapResult),
    onSuccess: () => {
      toast.success('Modelo duplicado.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) =>
      setTemplateArchivedAction(input).then(unwrapResult),
    onSuccess: (_d, input) => {
      toast.success(
        input.archived
          ? 'Modelo arquivado. As fichas feitas continuam guardadas.'
          : 'Modelo restaurado.',
      );
      setArchiving(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = templates ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={showArchived} onCheckedChange={(v: boolean) => setShowArchived(v)} />
          Mostrar arquivados
        </label>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            disabled={starter.isPending}
            onClick={() => starter.mutate()}
          >
            <SparklesIcon /> Usar modelo inicial de anamnese
          </Button>
        )}
      </div>
      <div className="bg-tile overflow-hidden rounded-[22px]">
        {isLoading ? (
          <p className="text-label-secondary p-5 text-[14px]">Carregando…</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center pb-8">
            <EmptyState
              icon={FileTextIcon}
              title="Nenhum modelo ainda"
              description="Crie um modelo do zero ou comece pelo modelo inicial de anamnese (editável, não é ativado sozinho)."
            />
            {canManage && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/fichas/modelos/novo">Criar modelo</Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => starter.mutate()}
                  disabled={starter.isPending}
                >
                  Usar modelo inicial
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {list.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium">{t.name}</span>
                    <span className="bg-foreground/[0.06] text-label-secondary inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium">
                      {FORM_TYPE_LABEL[t.type]}
                    </span>
                    {t.status === 'ARCHIVED' && <FlagBadge>Arquivado</FlagBadge>}
                    {t.requirement !== 'NONE' && (
                      <FlagBadge tone="red">{REQUIREMENT_LABEL[t.requirement]}</FlagBadge>
                    )}
                  </div>
                  <div className="text-label-secondary text-[12px]">
                    v{t.currentVersion} · {t.questionCount} perguntas · {FILLER_LABEL[t.fillableBy]}{' '}
                    ·{' '}
                    {t.renewal === 'AFTER_DAYS'
                      ? `a cada ${t.renewalDays} dias`
                      : RENEWAL_LABEL[t.renewal].toLowerCase()}{' '}
                    ·{' '}
                    {t.services.length
                      ? t.services.map((s) => s.name).join(', ')
                      : 'sem serviço vinculado'}{' '}
                    · {t.entryCount} {t.entryCount === 1 ? 'ficha' : 'fichas'} · atualizado{' '}
                    {new Intl.DateTimeFormat('pt-BR').format(new Date(t.updatedAt))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewId(t.id)}>
                    Visualizar
                  </Button>
                  {canManage && t.status === 'ACTIVE' && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/fichas/modelos/${t.id}`}>Editar</Link>
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(t.id)}
                    >
                      Duplicar
                    </Button>
                  )}
                  {canManage &&
                    (t.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setArchiving({ id: t.id, name: t.name })}
                      >
                        Arquivar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => archive.mutate({ id: t.id, archived: false })}
                      >
                        Restaurar
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TemplatePreview id={previewId} onClose={() => setPreviewId(null)} />
      <ConfirmDialog
        open={!!archiving}
        title={`Arquivar “${archiving?.name ?? ''}”?`}
        description="O modelo deixa de receber pedidos novos. As fichas já feitas continuam guardadas e visíveis."
        confirmLabel="Arquivar"
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate({ id: archiving.id, archived: true })}
        onOpenChange={(o) => !o && setArchiving(null)}
      />
    </section>
  );
}

function TemplatePreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['form-template', id],
    queryFn: () => getTemplateAction({ id: id! }).then(unwrapResult),
    enabled: !!id,
  });
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  return (
    <Dialog open={!!id} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.name ?? 'Modelo'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${FORM_TYPE_LABEL[data.type]} · versão ${data.version}. Respostas da prévia não são salvas.`
              : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>
        {data?.instructions && (
          <p className="text-label-secondary text-[13px] whitespace-pre-wrap">
            {data.instructions}
          </p>
        )}
        {data && (
          <FormRenderer
            schema={data.schema}
            answers={answers}
            onChange={(qid, value) => setAnswers((a) => ({ ...a, [qid]: value }))}
            idPrefix="tp"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Preenchimentos -----------------------------------------------------------------------------

function EntriesTab({ timezone }: { timezone: string }) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [templateId, setTemplateId] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [openEntry, setOpenEntry] = React.useState<EntrySummary | null>(null);
  const { data: templates } = useQuery({
    queryKey: ['form-templates', true],
    queryFn: () => listTemplatesAction({ includeArchived: true }),
  });
  const filters = {
    search: search.trim() || undefined,
    status: status === 'all' ? undefined : status,
    type: type === 'all' ? undefined : type,
    templateId: templateId === 'all' ? undefined : templateId,
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000) : undefined,
    page,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['form-entries', filters],
    queryFn: () => listEntriesAction(filters),
    placeholderData: (previous) => previous,
  });
  const reset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!(
    filters.search ||
    filters.status ||
    filters.type ||
    filters.templateId ||
    from ||
    to
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          className="lg:col-span-2"
          placeholder="Buscar por cliente"
          aria-label="Buscar por cliente"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={reset(setStatus)}
          options={Object.entries(ENTRY_STATUS_LABEL)}
        />
        <FilterSelect
          label="Tipo"
          value={type}
          onChange={reset(setType)}
          options={Object.entries(FORM_TYPE_LABEL)}
        />
        <FilterSelect
          label="Modelo"
          value={templateId}
          onChange={reset(setTemplateId)}
          options={(templates ?? []).map((t) => [t.id, t.name] as [string, string])}
        />
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Input
            className="min-w-0"
            type="date"
            aria-label="De"
            value={from}
            onChange={(e) => reset(setFrom)(e.target.value)}
          />
          <Input
            type="date"
            aria-label="Até"
            className="min-w-0"
            value={to}
            onChange={(e) => reset(setTo)(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-tile overflow-hidden rounded-[22px]">
        {isLoading && !data ? (
          <p className="text-label-secondary p-5 text-[14px]">Carregando…</p>
        ) : !data || data.entries.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title={filtered ? 'Nada com esses filtros' : 'Nenhuma ficha pedida ainda'}
            description={
              filtered
                ? 'Limpe ou mude os filtros para ver mais.'
                : 'Peça fichas na página do cliente ou vincule modelos a serviços para pedir pela agenda.'
            }
          />
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {data.entries.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="hover:bg-foreground/[0.03] flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors md:flex-row md:items-center md:gap-4"
                  onClick={() =>
                    setOpenEntry({
                      id: row.id,
                      status: row.status,
                      template: row.template,
                      client: row.client,
                      fillableBy: row.fillableBy,
                    })
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium">{row.client.name}</span>
                      <EntryStatusBadge status={row.status} />
                      {row.needsCheck && <FlagBadge>Cópia a conferir</FlagBadge>}
                    </div>
                    <div className="text-label-secondary text-[12px]">
                      {row.template.name} (v{row.version}) · {FORM_TYPE_LABEL[row.template.type]}
                      {row.appointmentAt
                        ? ` · ${row.appointmentService ?? 'atendimento'} ${formatDate(row.appointmentAt, timezone, true)}`
                        : ''}
                      {row.packageName ? ` · ${row.packageName}` : ''}
                    </div>
                  </div>
                  <div className="text-label-secondary text-[12px] md:text-right">
                    <div>{formatDate(row.submittedAt ?? row.createdAt, timezone)}</div>
                    <div>
                      {row.reviewedByName
                        ? `Revisada por ${row.reviewedByName}`
                        : row.status === 'SUBMITTED'
                          ? 'Aguardando revisão'
                          : ''}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <nav className="flex items-center justify-between gap-2 text-[13px]" aria-label="Paginação">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-label-secondary">
            Página {page} de {totalPages} · {data.total} fichas
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </nav>
      )}

      <EntryDialog
        entry={openEntry}
        open={!!openEntry}
        onOpenChange={(o) => !o && setOpenEntry(null)}
        timezone={timezone}
      />
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---- Acesso e privacidade -----------------------------------------------------------------------

const FLAGS = [
  { key: 'canRequest', label: 'Pedir fichas e gerar link', hint: 'Não dá acesso às respostas' },
  { key: 'canRead', label: 'Ler respostas', hint: 'Inclui registros das sessões e assinaturas' },
  { key: 'canFill', label: 'Preencher em nome do cliente', hint: 'Requer ler respostas' },
  { key: 'canReview', label: 'Revisar', hint: 'Requer ler respostas' },
  { key: 'canExport', label: 'Exportar PDF', hint: 'Requer ler respostas' },
  { key: 'canManage', label: 'Gerenciar modelos', hint: 'Administradores já podem' },
  { key: 'canAudit', label: 'Ver histórico de acesso', hint: 'Administradores já podem' },
] as const;

type Member = Extract<
  Awaited<ReturnType<typeof listFormPermissionsAction>>,
  { ok: true }
>['data'][number];

type Flags = Record<(typeof FLAGS)[number]['key'], boolean> & { scope: 'ALL' | 'OWN' };

function AccessTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['form-permissions'],
    queryFn: () => listFormPermissionsAction().then(unwrapResult),
  });
  const save = useMutation({
    mutationFn: (input: { userId: string; flags: Flags }) =>
      setFormPermissionAction(input).then(unwrapResult),
    onSuccess: () => {
      toast.success('Permissões salvas.');
      queryClient.invalidateQueries({ queryKey: ['form-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['form-access'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="bg-system-blue/[0.06] rounded-[18px] p-4 text-[13px]">
        Toda a equipe vê se uma ficha está pendente, enviada ou revisada. As respostas (inclusive de
        saúde) só aparecem para quem tiver “Ler respostas” — também para administradores, que
        precisam se conceder essa permissão. Cada mudança fica registrada no histórico.
      </div>
      {isLoading ? (
        <p className="text-label-secondary text-[14px]">Carregando equipe…</p>
      ) : error ? (
        <p className="text-system-red text-[14px]">{(error as Error).message}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(data ?? []).map((member) => (
            <MemberPermissions
              key={member.userId}
              member={member}
              pending={save.isPending}
              onSave={(flags) => save.mutate({ userId: member.userId, flags })}
            />
          ))}
        </ul>
      )}
      <PrivacyNotice />
    </section>
  );
}

function MemberPermissions({
  member,
  pending,
  onSave,
}: {
  member: Member;
  pending: boolean;
  onSave: (flags: Flags) => void;
}) {
  const initial: Flags = {
    canRequest: member.grant?.canRequest ?? true,
    canRead: member.grant?.canRead ?? false,
    canFill: member.grant?.canFill ?? false,
    canReview: member.grant?.canReview ?? false,
    canExport: member.grant?.canExport ?? false,
    canManage: member.grant?.canManage ?? false,
    canAudit: member.grant?.canAudit ?? false,
    scope: member.grant?.scope ?? 'ALL',
  };
  const [flags, setFlags] = React.useState(initial);
  const dirty = JSON.stringify(flags) !== JSON.stringify(initial);
  const toggle = (key: (typeof FLAGS)[number]['key'], value: boolean) =>
    setFlags((f) => {
      const next = { ...f, [key]: value };
      // Sem ler, não dá para preencher, revisar nem exportar.
      if (key === 'canRead' && !value)
        Object.assign(next, { canFill: false, canReview: false, canExport: false });
      if ((key === 'canFill' || key === 'canReview' || key === 'canExport') && value)
        next.canRead = true;
      return next;
    });
  return (
    <li className="bg-tile flex flex-col gap-3 rounded-[22px] p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{member.name}</div>
          <div className="text-label-secondary truncate text-[12px]">
            {member.email} · {member.role === 'admin' ? 'Administrador' : 'Equipe'}
          </div>
        </div>
        <Select
          value={flags.scope}
          onValueChange={(v: string) => setFlags((f) => ({ ...f, scope: v as Flags['scope'] }))}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label={`Alcance de ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as fichas</SelectItem>
            <SelectItem value="OWN">Só dos próprios atendimentos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FLAGS.map((flag) => (
          <label key={flag.key} className="flex items-start justify-between gap-3 text-[13px]">
            <span>
              {flag.label}
              <span className="text-label-secondary block text-[11px]">{flag.hint}</span>
            </span>
            <Switch
              checked={flags[flag.key]}
              aria-label={flag.label}
              onCheckedChange={(v: boolean) => toggle(flag.key, v)}
            />
          </label>
        ))}
      </div>
      {flags.scope === 'OWN' && (
        <p className="text-label-secondary text-[12px]">
          “Próprios atendimentos” usa o e-mail do profissional cadastrado igual ao e-mail de login
          desta pessoa.
        </p>
      )}
      <Button
        size="sm"
        className={cn('self-start', !dirty && 'opacity-60')}
        disabled={!dirty || pending}
        onClick={() => onSave(flags)}
      >
        Salvar permissões
      </Button>
    </li>
  );
}

function PrivacyNotice() {
  const { data } = useQuery({
    queryKey: ['forms-settings'],
    queryFn: () => getFormsSettingsAction(),
  });
  if (!data) return null;
  return <PrivacyNoticeForm key={data.privacyNotice} initial={data.privacyNotice} />;
}

function PrivacyNoticeForm({ initial }: { initial: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = React.useState(initial);
  const save = useMutation({
    mutationFn: () => setFormsPrivacyNoticeAction({ text }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Aviso de privacidade salvo.');
      queryClient.invalidateQueries({ queryKey: ['forms-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="bg-tile flex flex-col gap-2 rounded-[22px] p-4 md:p-5">
      <label htmlFor="privacy-notice" className="text-[15px] font-semibold">
        Aviso de privacidade no link da ficha
      </label>
      <p className="text-label-secondary text-[12px]">
        Texto escrito pela sua empresa, mostrado ao cliente antes de responder. O Atendafy não cria
        termos nem garante conformidade legal; revise com quem orienta sua empresa.
      </p>
      <Textarea
        id="privacy-notice"
        rows={4}
        value={text}
        maxLength={3000}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        className="self-start"
        disabled={save.isPending || text === initial}
        onClick={() => save.mutate()}
      >
        Salvar aviso
      </Button>
    </div>
  );
}
