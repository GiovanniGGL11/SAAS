'use client';

import { StockHistoryDialog } from '@/components/estoque/stock-history-dialog';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  PackageIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticPatchItem } from '@/lib/query-cache';
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
import { MobileList, MobileListItem } from '@/components/layout/mobile-list';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader, Surface } from '@/components/layout/page';
import { ListToolbar, SearchField, matchesSearch } from '@/components/layout/list-controls';
import { ProductDrawer } from '@/components/estoque/product-drawer';
import { StockMovementDialog } from '@/components/estoque/stock-movement-dialog';
import { listProductsAction, setProductActiveAction } from '@/server/actions/stock-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedProduct } from '@/lib/serialize';

export function ProductList({ initialProducts }: { initialProducts: SerializedProduct[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<SerializedProduct | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'active' | 'low' | 'inactive' | 'all'>('active');

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: listProductsAction,
    initialData: initialProducts,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setProductActiveAction(input).then(unwrapResult),
    onMutate: async ({ id, active }) => ({
      rollback: await optimisticPatchItem<SerializedProduct>(queryClient, ['products'], id, {
        active,
      }),
    }),
    onError: (error: Error, _input, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  function openCreate() {
    setEditingProduct(null);
    setDrawerOpen(true);
  }

  function openEdit(product: SerializedProduct) {
    setEditingProduct(product);
    setDrawerOpen(true);
  }

  const isLow = (product: SerializedProduct) =>
    product.active && product.quantity <= product.minQuantity;
  const lowStock = products.filter(isLow);
  const stockValue = products
    .filter((product) => product.active)
    .reduce((sum, product) => sum + product.costPrice * Math.max(product.quantity, 0), 0);

  const filtered = products.filter((product) => {
    if (filter === 'active' && !product.active) return false;
    if (filter === 'inactive' && product.active) return false;
    if (filter === 'low' && !isLow(product)) return false;
    return matchesSearch(search, product.name, product.sku);
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Estoque"
        description={`${products.filter((p) => p.active).length} produtos ativos · ${formatCurrencyBRL(stockValue)} em estoque (preço de custo).`}
        actions={
          <>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              Histórico
            </Button>
            <Button variant="outline" onClick={() => setMovementDialogOpen(true)}>
              <ArrowLeftRightIcon className="size-4" />
              Nova movimentação
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Novo produto
            </Button>
          </>
        }
      />

      {lowStock.length > 0 && (
        <button
          type="button"
          onClick={() => setFilter('low')}
          className="bg-system-red/10 hover:bg-system-red/15 flex items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors"
        >
          <span className="bg-system-red flex size-8 shrink-0 items-center justify-center rounded-full text-white">
            <TriangleAlertIcon className="size-4" />
          </span>
          <span className="flex-1 text-[14px]">
            <span className="font-semibold">
              {lowStock.length} {lowStock.length === 1 ? 'produto está' : 'produtos estão'} no
              estoque mínimo ou abaixo.
            </span>{' '}
            <span className="text-label-secondary">
              {lowStock
                .slice(0, 3)
                .map((product) => product.name)
                .join(', ')}
              {lowStock.length > 3 ? '…' : ''}
            </span>
          </span>
          <ChevronRightIcon className="text-label-secondary size-4" />
        </button>
      )}

      <ListToolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar por nome ou SKU" />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: 'Ativos' },
            {
              value: 'low',
              label: `Estoque baixo${lowStock.length ? ` · ${lowStock.length}` : ''}`,
            },
            { value: 'inactive', label: 'Inativos' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      <Surface>
        {filtered.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title={
              products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'
            }
            description={
              products.length === 0
                ? 'Cadastre produtos pra controlar estoque e vender durante atendimentos.'
                : 'Ajuste a busca ou o filtro.'
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead>Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => {
                    const lowStock = isLow(product);
                    const level =
                      product.minQuantity > 0
                        ? Math.min(product.quantity / (product.minQuantity * 3), 1)
                        : product.quantity > 0
                          ? 1
                          : 0;
                    return (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() => openEdit(product)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.name}</span>
                            {product.sku && (
                              <span className="text-muted-foreground text-xs">{product.sku}</span>
                            )}
                            {!product.active && <Badge variant="outline">Inativo</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={
                                lowStock ? 'text-system-red w-8 font-semibold' : 'w-8 font-medium'
                              }
                            >
                              {product.quantity}
                            </span>
                            <span className="bg-foreground/[0.08] hidden h-1.5 w-20 overflow-hidden rounded-full sm:block">
                              <span
                                className={cn(
                                  'block h-full rounded-full transition-[width] duration-700',
                                  lowStock ? 'bg-system-red' : 'bg-system-green',
                                )}
                                style={{ width: `${level * 100}%` }}
                              />
                            </span>
                            {product.minQuantity > 0 && (
                              <span className="text-label-secondary text-[12px]">
                                mín. {product.minQuantity}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatCurrencyBRL(product.costPrice)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatCurrencyBRL(product.salePrice)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={product.active}
                            onCheckedChange={(checked: boolean) =>
                              toggleActive.mutate({ id: product.id, active: checked })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <MobileList>
              {filtered.map((product) => {
                const lowStock = isLow(product);
                return (
                  <MobileListItem
                    key={product.id}
                    onClick={() => openEdit(product)}
                    leading={
                      <span
                        className={cn(
                          'flex size-10 shrink-0 flex-col items-center justify-center rounded-[11px] leading-none tabular-nums',
                          lowStock
                            ? 'bg-system-red/12 text-system-red'
                            : 'bg-system-green/12 text-system-green',
                        )}
                      >
                        <span className="text-[15px] font-bold">{product.quantity}</span>
                        <span className="text-[9px] font-medium">un.</span>
                      </span>
                    }
                    title={
                      <>
                        <span className="truncate">{product.name}</span>
                        {!product.active && <Badge variant="outline">Inativo</Badge>}
                      </>
                    }
                    subtitle={
                      lowStock
                        ? `Estoque baixo · mín. ${product.minQuantity}`
                        : [
                            product.sku,
                            product.minQuantity > 0 ? `mín. ${product.minQuantity}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Toque para editar'
                    }
                    trailing={
                      <span className="text-[15px] font-semibold tabular-nums">
                        {formatCurrencyBRL(product.salePrice)}
                      </span>
                    }
                  />
                );
              })}
            </MobileList>
          </>
        )}
      </Surface>

      <ProductDrawer open={drawerOpen} onOpenChange={setDrawerOpen} product={editingProduct} />
      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        products={products}
      />
      <StockHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
