'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ScissorsIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
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
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader, Surface } from '@/components/layout/page';
import { ListToolbar, SearchField, matchesSearch } from '@/components/layout/list-controls';
import { ServiceDrawer } from '@/components/servicos/service-drawer';
import { listServicesAction, setServiceActiveAction } from '@/server/actions/service-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedService } from '@/lib/serialize';

const ALL = '__all__';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function ServiceList({ initialServices }: { initialServices: SerializedService[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<SerializedService | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'active' | 'inactive' | 'all'>('active');
  const [category, setCategory] = React.useState<string>(ALL);

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: listServicesAction,
    initialData: initialServices,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setServiceActiveAction(input).then(unwrapResult),
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

  const categories = Array.from(
    new Set(services.map((service) => service.category).filter((c): c is string => Boolean(c))),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filtered = services.filter((service) => {
    if (filter === 'active' && !service.active) return false;
    if (filter === 'inactive' && service.active) return false;
    if (category !== ALL && service.category !== category) return false;
    return matchesSearch(search, service.name, service.category);
  });
  const activeCount = services.filter((service) => service.active).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Serviços"
        description={`${activeCount} ${activeCount === 1 ? 'serviço ativo' : 'serviços ativos'} no catálogo.`}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Novo serviço
          </Button>
        }
      />

      <ListToolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar serviço ou categoria"
        />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: 'Ativos' },
            { value: 'inactive', label: 'Inativos' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      {categories.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-2">
          {[ALL, ...categories].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                category === value
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10',
              )}
            >
              {value === ALL ? 'Todas as categorias' : value}
            </button>
          ))}
        </div>
      )}

      <Surface>
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
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={ScissorsIcon}
                    title={
                      services.length === 0
                        ? 'Nenhum serviço cadastrado'
                        : 'Nenhum serviço encontrado'
                    }
                    description={
                      services.length === 0
                        ? 'Cadastre os serviços que sua empresa oferece.'
                        : 'Ajuste a busca ou os filtros.'
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {filtered.map((service) => (
              <TableRow
                key={service.id}
                className="cursor-pointer"
                onClick={() => openEdit(service)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white"
                      style={{ backgroundColor: service.color }}
                    >
                      <ScissorsIcon className="size-4" />
                    </span>
                    <span className="font-medium">{service.name}</span>
                    {!service.active && <Badge variant="outline">Inativo</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-label-secondary">{service.category || '—'}</TableCell>
                <TableCell className="text-label-secondary tabular-nums">
                  {formatDuration(service.durationMinutes)}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
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
      </Surface>

      <ServiceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} service={editingService} />
    </div>
  );
}
