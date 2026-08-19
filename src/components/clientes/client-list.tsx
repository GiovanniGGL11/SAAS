'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, StarIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClientDrawer } from '@/components/clientes/client-drawer';
import { listClientsAction, setClientActiveAction } from '@/server/actions/client-actions';
import type { Client } from '@/generated/prisma/client';

export function ClientList({ initialClients }: { initialClients: Client[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

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

  const filtered = search.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : clients;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">Base de clientes da empresa.</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <PlusIcon className="size-4" />
          Novo cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link
                    href={`/clientes/${client.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    {client.name}
                    {client.isVip && (
                      <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
                    )}
                    {!client.active && <Badge variant="outline">Arquivado</Badge>}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.phone || client.email || '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={client.active}
                    onCheckedChange={(checked: boolean) =>
                      toggleActive.mutate({ id: client.id, active: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ClientDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
