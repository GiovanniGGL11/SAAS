'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardListIcon, PlusIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { FORM_TYPE_LABEL } from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { EmptyState } from '@/components/ui/empty-state';
import { EntryDialog, type EntrySummary, useFormAccess } from '@/components/fichas/entry-dialog';
import { EntryStatusBadge, FlagBadge } from '@/components/fichas/entry-status-badge';
import { formatDate } from '@/components/fichas/labels';
import {
  listClientEntriesAction,
  listTemplatesAction,
  requestEntryAction,
} from '@/server/actions/form-actions';
import { getClientPackagesAction } from '@/server/actions/package-actions';

type Row = Awaited<ReturnType<typeof listClientEntriesAction>>['entries'][number];

/** Aba "Fichas e formulários" do cliente: lista cronológica, nova ficha e acesso a cada uma. */
export function ClientFormsTab({
  clientId,
  clientName,
  timezone,
}: {
  clientId: string;
  clientName: string;
  timezone: string;
}) {
  const { data: access } = useFormAccess();
  const { data, isLoading } = useQuery({
    queryKey: ['client-entries', clientId],
    queryFn: () => listClientEntriesAction(clientId),
  });
  const [openEntry, setOpenEntry] = React.useState<EntrySummary | null>(null);
  const [creating, setCreating] = React.useState(false);

  const rows = data?.entries ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Fichas e formulários</h2>
          <p className="text-label-secondary text-[13px]">
            Ficha inicial, avaliações e formulários deste cliente. Cada envio fica guardado.
          </p>
        </div>
        {access?.canRequest && (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> Nova ficha
          </Button>
        )}
      </div>

      <div className="bg-tile overflow-hidden rounded-[22px]">
        {isLoading ? (
          <p className="text-label-secondary p-5 text-[14px]">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title="Nenhuma ficha ainda"
            description={
              access?.canRequest
                ? 'Use "Nova ficha" para pedir uma anamnese, avaliação ou formulário.'
                : 'As fichas pedidas para este cliente aparecem aqui.'
            }
          />
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenEntry({
                      id: row.id,
                      status: row.status,
                      template: row.template,
                      client: { name: clientName },
                      fillableBy: row.fillableBy,
                    })
                  }
                  className="hover:bg-foreground/[0.03] flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium">{row.template.name}</span>
                    <EntryStatusBadge status={row.status} />
                    {row.status === 'DRAFT' && (
                      <span className="text-system-blue text-[12px]">Continuar rascunho</span>
                    )}
                    {row.needsCheck && <FlagBadge>Respostas copiadas a conferir</FlagBadge>}
                    {row.updateDue && <FlagBadge tone="red">Atualização necessária</FlagBadge>}
                    {row.linkActive && <FlagBadge>Link ativo</FlagBadge>}
                  </div>
                  <div className="text-label-secondary text-[12px]">
                    {FORM_TYPE_LABEL[row.template.type]} · v{row.version} · pedida{' '}
                    {formatDate(row.createdAt, timezone)}
                    {row.submittedAt ? ` · enviada ${formatDate(row.submittedAt, timezone)}` : ''}
                    {row.appointmentAt
                      ? ` · atendimento ${formatDate(row.appointmentAt, timezone, true)}${row.appointmentService ? ` (${row.appointmentService})` : ''}`
                      : ''}
                    {row.packageName ? ` · pacote ${row.packageName}` : ''}
                    {row.filledByName
                      ? ` · preenchida por ${row.filledByName}`
                      : row.filledBy === 'CLIENT'
                        ? ' · preenchida pelo cliente'
                        : ''}
                    {row.reviewedByName ? ` · revisada por ${row.reviewedByName}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EntryDialog
        entry={openEntry}
        open={!!openEntry}
        onOpenChange={(o: boolean) => !o && setOpenEntry(null)}
        timezone={timezone}
      />
      {creating && (
        <NewEntryDialog
          clientId={clientId}
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setOpenEntry({ ...row, client: { name: clientName } });
          }}
        />
      )}
    </section>
  );
}

function NewEntryDialog({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (row: EntrySummary) => void;
}) {
  const queryClient = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ['form-templates', false],
    queryFn: () => listTemplatesAction({}),
  });
  const { data: packages } = useQuery({
    queryKey: ['client-packages-detail', clientId],
    queryFn: () => getClientPackagesAction(clientId),
  });
  const [templateId, setTemplateId] = React.useState('');
  const [packageId, setPackageId] = React.useState('none');
  const template = templates?.find((t) => t.id === templateId);

  const create = useMutation({
    mutationFn: () =>
      requestEntryAction({
        clientId,
        templateId,
        clientPackageId: packageId === 'none' ? null : packageId,
      }).then(unwrapResult),
    onSuccess: ({ id, created }) => {
      if (!created) toast.info('Já havia uma ficha deste modelo em aberto: abrindo ela.');
      queryClient.invalidateQueries({ queryKey: ['client-entries', clientId] });
      onCreated({
        id,
        status: 'REQUESTED',
        template: { name: template!.name, type: template!.type },
        fillableBy: template!.fillableBy,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activePackages = (packages ?? []).filter((p) => p.status === 'ACTIVE');

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova ficha</DialogTitle>
          <DialogDescription>
            Escolha o modelo. Você pode preencher agora ou gerar um link para o cliente.
          </DialogDescription>
        </DialogHeader>
        {templates && templates.length === 0 ? (
          <p className="text-[14px]">
            Nenhum modelo ativo.{' '}
            <Link href="/fichas" className="text-system-blue hover:underline">
              Criar um modelo
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Modelo</span>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full" aria-label="Modelo">
                  <SelectValue placeholder="Escolha um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {FORM_TYPE_LABEL[t.type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activePackages.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Vincular a um pacote (opcional)</span>
                <Select value={packageId} onValueChange={setPackageId}>
                  <SelectTrigger className="w-full" aria-label="Pacote">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem pacote</SelectItem>
                    {activePackages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.progress}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button disabled={!templateId || create.isPending} onClick={() => create.mutate()}>
            Criar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Row as ClientEntryRow };
