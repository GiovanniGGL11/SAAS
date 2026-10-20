'use client';

import { useAuth } from '@clerk/nextjs';
import { ImportClientsDialog } from '@/components/clientes/import-clients-dialog';
import { ImportWizard } from '@/components/importacao/import-wizard';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { usePlanFeatures } from '@/components/plan/use-plan-features';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, PlusIcon, StarIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticPatchItem } from '@/lib/query-cache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileList, MobileListItem } from '@/components/layout/mobile-list';
import { PageHeader, Surface } from '@/components/layout/page';
import {
  InitialsAvatar,
  ListToolbar,
  SearchField,
  matchesSearch,
} from '@/components/layout/list-controls';
import { ClientDrawer } from '@/components/clientes/client-drawer';
import { listClientsAction, setClientActiveAction } from '@/server/actions/client-actions';
import type { Client } from '@/generated/prisma/client';

export type ClientFilter = 'active' | 'vip' | 'lapsed' | 'birthdays' | 'new' | 'archived' | 'all';

const FILTER_HINTS: Partial<Record<ClientFilter, string>> = {
  lapsed: 'Ninguém sumido: todos os clientes vieram nos últimos 60 dias ou já têm horário marcado.',
  birthdays: 'Nenhum aniversariante este mês (ou faltam datas de nascimento no cadastro).',
  new: 'Nenhum cliente cadastrado nos últimos 30 dias.',
};

export function ClientList({
  initialClients,
  lapsedIds,
  initialFilter = 'active',
  timezone,
}: {
  initialClients: Client[];
  /** Ativos que não voltam há mais de 60 dias e não têm nada marcado. */
  lapsedIds: string[];
  initialFilter?: ClientFilter;
  timezone: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  // Importar é de admin; a equipe só cadastra um por vez.
  const isAdmin = useAuth().orgRole === 'org:admin';
  const planFeatures = usePlanFeatures();
  // Profissional em diante: importação assistida (mapeamento, prévia, duplicados, relatório).
  const assistedImport = planFeatures.has('assistedImport');
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<ClientFilter>(initialFilter);
  const lapsedSet = React.useMemo(() => new Set(lapsedIds), [lapsedIds]);
  // Mês atual no fuso da empresa e o corte de "novo" (cadastrado nos últimos 30 dias).
  const [{ month, newSince }] = React.useState(() => ({
    month: Number(
      new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: timezone }).format(new Date()),
    ),
    newSince: Date.now() - 30 * 86_400_000,
  }));
  // Aniversário gravado como meia-noite UTC: o mês certo é o UTC.
  const isBirthdayMonth = (c: Client) =>
    !!c.birthDate && new Date(c.birthDate).getUTCMonth() + 1 === month;
  const isNew = (c: Client) => new Date(c.createdAt).getTime() >= newSince;

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsAction,
    initialData: initialClients,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setClientActiveAction(input).then(unwrapResult),
    onMutate: async ({ id, active }) => ({
      rollback: await optimisticPatchItem<Client>(queryClient, ['clients'], id, { active }),
    }),
    onError: (error: Error, _input, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const filtered = clients.filter((client) => {
    if (filter === 'active' && !client.active) return false;
    if (filter === 'archived' && client.active) return false;
    if (filter === 'vip' && !client.isVip) return false;
    if (filter === 'lapsed' && !lapsedSet.has(client.id)) return false;
    if (filter === 'birthdays' && (!client.active || !isBirthdayMonth(client))) return false;
    if (filter === 'new' && !isNew(client)) return false;
    return matchesSearch(search, client.name, client.phone, client.email);
  });

  const counts = {
    active: clients.filter((c) => c.active).length,
    vip: clients.filter((c) => c.isVip).length,
    archived: clients.filter((c) => !c.active).length,
    lapsed: lapsedIds.length,
    birthdays: clients.filter((c) => c.active && isBirthdayMonth(c)).length,
    new: clients.filter(isNew).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        description={`${counts.active} ${counts.active === 1 ? 'cliente ativo' : 'clientes ativos'} na sua base.`}
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                Importar
              </Button>
            )}
            <Button onClick={() => setDrawerOpen(true)}>
              <PlusIcon className="size-4" />
              Novo cliente
            </Button>
          </>
        }
      />

      <ListToolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nome, telefone ou e-mail"
        />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: 'Ativos' },
            { value: 'vip', label: `VIP${counts.vip ? ` · ${counts.vip}` : ''}` },
            { value: 'lapsed', label: `Sumidos${counts.lapsed ? ` · ${counts.lapsed}` : ''}` },
            {
              value: 'birthdays',
              label: `Aniversariantes${counts.birthdays ? ` · ${counts.birthdays}` : ''}`,
            },
            { value: 'new', label: `Novos${counts.new ? ` · ${counts.new}` : ''}` },
            { value: 'archived', label: 'Arquivados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      <Surface>
        {filtered.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={clients.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum cliente encontrado'}
            description={
              clients.length === 0
                ? 'Cadastre seu primeiro cliente para começar a agendar.'
                : (FILTER_HINTS[filter] ?? 'Ajuste a busca ou o filtro.')
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="w-24">Ativo</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((client) => (
                    <TableRow
                      key={client.id}
                      className="group cursor-pointer"
                      onClick={() => router.push(`/clientes/${client.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <InitialsAvatar
                            name={client.name}
                            color={client.isVip ? '#ff9500' : undefined}
                          />
                          <span className="font-medium">{client.name}</span>
                          {client.isVip && (
                            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
                          )}
                          {!client.active && <Badge variant="outline">Arquivado</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-label-secondary">
                        {client.phone || client.email || '—'}
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Switch
                          checked={client.active}
                          onCheckedChange={(checked: boolean) =>
                            toggleActive.mutate({ id: client.id, active: checked })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <ChevronRightIcon className="text-label-secondary size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileList>
              {filtered.map((client) => (
                <MobileListItem
                  key={client.id}
                  href={`/clientes/${client.id}`}
                  leading={
                    <InitialsAvatar
                      name={client.name}
                      color={client.isVip ? '#ff9500' : undefined}
                      className="size-10 text-[14px]"
                    />
                  }
                  title={
                    <>
                      <span className="truncate">{client.name}</span>
                      {client.isVip && (
                        <StarIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      {!client.active && <Badge variant="outline">Arquivado</Badge>}
                    </>
                  }
                  subtitle={client.phone || client.email || 'Sem contato'}
                />
              ))}
            </MobileList>
          </>
        )}
      </Surface>

      <ClientDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      {assistedImport ? (
        <ImportWizard kind="clients" open={importOpen} onOpenChange={setImportOpen} />
      ) : (
        <ImportClientsDialog open={importOpen} onOpenChange={setImportOpen} />
      )}
    </div>
  );
}
