'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { ProductDrawer } from '@/components/estoque/product-drawer';
import { StockMovementDialog } from '@/components/estoque/stock-movement-dialog';
import { listProductsAction, setProductActiveAction } from '@/server/actions/stock-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedProduct } from '@/lib/serialize';

export function ProductList({ initialProducts }: { initialProducts: SerializedProduct[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<SerializedProduct | null>(null);

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: listProductsAction,
    initialData: initialProducts,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setProductActiveAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  function openCreate() {
    setEditingProduct(null);
    setDrawerOpen(true);
  }

  function openEdit(product: SerializedProduct) {
    setEditingProduct(product);
    setDrawerOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground text-sm">Produtos e movimentações de estoque.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMovementDialogOpen(true)}>
            Nova movimentação
          </Button>
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Novo produto
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
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
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={PackageIcon}
                    title="Nenhum produto cadastrado"
                    description="Cadastre produtos pra controlar estoque e vender durante atendimentos."
                  />
                </TableCell>
              </TableRow>
            )}
            {products.map((product) => {
              const lowStock = product.quantity <= product.minQuantity;
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
                    <div className="flex items-center gap-1.5">
                      {lowStock && <TriangleAlertIcon className="text-destructive size-3.5" />}
                      <span className={lowStock ? 'text-destructive font-medium' : undefined}>
                        {product.quantity}
                      </span>
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

      <ProductDrawer open={drawerOpen} onOpenChange={setDrawerOpen} product={editingProduct} />
      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        products={products}
      />
    </div>
  );
}
