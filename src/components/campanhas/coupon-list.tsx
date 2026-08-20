'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MegaphoneIcon, PlusIcon } from 'lucide-react';
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
import { CouponDrawer } from '@/components/campanhas/coupon-drawer';
import { listCouponsAction, setCouponActiveAction } from '@/server/actions/coupon-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedCoupon } from '@/lib/serialize';

function formatDiscount(coupon: SerializedCoupon): string {
  return coupon.discountType === 'PERCENTAGE'
    ? `${coupon.discountValue}%`
    : formatCurrencyBRL(coupon.discountValue);
}

export function CouponList({ initialCoupons }: { initialCoupons: SerializedCoupon[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingCoupon, setEditingCoupon] = React.useState<SerializedCoupon | null>(null);

  const { data: coupons } = useQuery({
    queryKey: ['coupons'],
    queryFn: listCouponsAction,
    initialData: initialCoupons,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setCouponActiveAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coupons'] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  function openCreate() {
    setEditingCoupon(null);
    setDrawerOpen(true);
  }

  function openEdit(coupon: SerializedCoupon) {
    setEditingCoupon(coupon);
    setDrawerOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-muted-foreground text-sm">Cupons de desconto para seus clientes.</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Novo cupom
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={MegaphoneIcon}
                    title="Nenhum cupom cadastrado"
                    description="Crie um cupom de desconto pra atrair novos clientes."
                  />
                </TableCell>
              </TableRow>
            )}
            {coupons.map((coupon) => (
              <TableRow key={coupon.id} className="cursor-pointer" onClick={() => openEdit(coupon)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{coupon.code}</span>
                    {!coupon.active && <Badge variant="outline">Inativo</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDiscount(coupon)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {coupon.expiresAt
                    ? new Intl.DateTimeFormat('pt-BR').format(new Date(coupon.expiresAt))
                    : 'Sem validade'}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {coupon.usedCount}
                  {coupon.maxUses ? ` / ${coupon.maxUses}` : ''}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={coupon.active}
                    onCheckedChange={(checked: boolean) =>
                      toggleActive.mutate({ id: coupon.id, active: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CouponDrawer open={drawerOpen} onOpenChange={setDrawerOpen} coupon={editingCoupon} />
    </div>
  );
}
