'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, PlusIcon, StarIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

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

type Filter = 'active' | 'vip' | 'archived' | 'all';

export function ClientList({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('active');

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsAction,
    initialData: initialClients,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setClientActiveAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  const filtered = clients.filter((client) => {
    if (filter === 'active' && !client.active) return false;
    if (filter === 'archived' && client.active) return false;
    if (filter === 'vip' && !client.isVip) return false;
    return matchesSearch(search, client.name, client.phone, client.email);
  });

  const counts = {
    active: clients.filter((c) => c.active).length,
    vip: clients.filter((c) => c.isVip).length,
    archived: clients.filter((c) => !c.active).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        description={`${counts.active} ${counts.active === 1 ? 'cliente ativo' : 'clientes ativos'} na sua base.`}
        actions={
          <Button onClick={() => setDrawerOpen(true)}>
            <PlusIcon className="size-4" />
            Novo cliente
          </Button>
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
            { value: 'archived', label: 'Arquivados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      <Surface>
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
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState
                    icon={UsersIcon}
                    title={
                      clients.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum cliente encontrado'
                    }
                    description={
                      clients.length === 0
                        ? 'Cadastre seu primeiro cliente para começar a agendar.'
                        : 'Ajuste a busca ou o filtro.'
                    }
                  />
                </TableCell>
              </TableRow>
            )}
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
      </Surface>

      <ClientDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
