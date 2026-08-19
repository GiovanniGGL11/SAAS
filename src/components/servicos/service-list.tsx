'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ServiceDrawer } from '@/components/servicos/service-drawer';
import { listServicesAction, setServiceActiveAction } from '@/server/actions/service-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedService } from '@/lib/serialize';

export function ServiceList({ initialServices }: { initialServices: SerializedService[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<SerializedService | null>(null);

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: listServicesAction,
    initialData: initialServices,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setServiceActiveAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  function openCreate() {
    setEditingService(null);
    setDrawerOpen(true);
  }

  function openEdit(service: SerializedService) {
    setEditingService(service);
    setDrawerOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground text-sm">Catálogo de serviços oferecidos.</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Novo serviço
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  Nenhum serviço cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {services.map((service) => (
              <TableRow
                key={service.id}
                className="cursor-pointer"
                onClick={() => openEdit(service)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: service.color }}
                    />
                    <span className="font-medium">{service.name}</span>
                    {!service.active && <Badge variant="outline">Inativo</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{service.category || '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {service.durationMinutes} min
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCurrencyBRL(service.price)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={service.active}
                    onCheckedChange={(checked: boolean) =>
                      toggleActive.mutate({ id: service.id, active: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ServiceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} service={editingService} />
    </div>
  );
}
