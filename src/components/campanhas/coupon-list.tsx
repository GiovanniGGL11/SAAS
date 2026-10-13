'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, MegaphoneIcon, PlusIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticPatchItem } from '@/lib/query-cache';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';
import { PageHeader, Surface } from '@/components/layout/page';
import { ListToolbar, SearchField, matchesSearch } from '@/components/layout/list-controls';
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

type CouponStatus = 'valid' | 'inactive' | 'expired' | 'exhausted';

const STATUS_LABEL: Record<CouponStatus, string> = {
  valid: 'Válido',
  inactive: 'Pausado',
  expired: 'Expirado',
  exhausted: 'Esgotado',
};

const COUPON_GRADIENTS = [
  'linear-gradient(135deg, #ff2d55, #ff6482)',
  'linear-gradient(135deg, #5856d6, #7d7aff)',
  'linear-gradient(135deg, #007aff, #40a0ff)',
  'linear-gradient(135deg, #ff9500, #ffb340)',
  'linear-gradient(135deg, #34c759, #30d158)',
  'linear-gradient(135deg, #af52de, #c977f0)',
];

function couponStatus(coupon: SerializedCoupon, now: number): CouponStatus {
  if (!coupon.active) return 'inactive';
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return 'expired';
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return 'exhausted';
  return 'valid';
}

export function CouponList({ initialCoupons }: { initialCoupons: SerializedCoupon[] }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingCoupon, setEditingCoupon] = React.useState<SerializedCoupon | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'valid' | 'ended' | 'all'>('all');

  const { data: coupons } = useQuery({
    queryKey: ['coupons'],
    queryFn: listCouponsAction,
    initialData: initialCoupons,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setCouponActiveAction(input).then(unwrapResult),
    onMutate: async ({ id, active }) => ({
      rollback: await optimisticPatchItem<SerializedCoupon>(queryClient, ['coupons'], id, {
        active,
      }),
    }),
    onError: (error: Error, _input, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['coupons'] }),
  });

  function openCreate() {
    setEditingCoupon(null);
    setDrawerOpen(true);
  }

  function openEdit(coupon: SerializedCoupon) {
    setEditingCoupon(coupon);
    setDrawerOpen(true);
  }

  const [now] = React.useState(() => Date.now());
  const filtered = coupons.filter((coupon) => {
    const status = couponStatus(coupon, now);
    if (filter === 'valid' && status !== 'valid') return false;
    if (filter === 'ended' && status === 'valid') return false;
    return matchesSearch(search, coupon.code, coupon.description);
  });
  const validCount = coupons.filter((c) => couponStatus(c, now) === 'valid').length;
  const totalUses = coupons.reduce((sum, c) => sum + c.usedCount, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Campanhas"
        description={`${validCount} ${validCount === 1 ? 'cupom válido' : 'cupons válidos'} · ${totalUses} ${totalUses === 1 ? 'uso' : 'usos'} no total.`}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Novo cupom
          </Button>
        }
      />

      <ListToolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar cupom" />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'valid', label: 'Válidos' },
            { value: 'ended', label: 'Encerrados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Surface>
          <EmptyState
            icon={MegaphoneIcon}
            title={coupons.length === 0 ? 'Nenhum cupom cadastrado' : 'Nenhum cupom encontrado'}
            description={
              coupons.length === 0
                ? 'Crie um cupom de desconto pra atrair novos clientes.'
                : 'Ajuste a busca ou o filtro.'
            }
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((coupon, index) => {
            const status = couponStatus(coupon, now);
            const usage = coupon.maxUses ? Math.min(coupon.usedCount / coupon.maxUses, 1) : null;
            return (
              <motion.div
                key={coupon.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 28,
                  delay: (index % 6) * 0.05,
                }}
                className={cn(
                  'group relative flex cursor-pointer flex-col overflow-hidden rounded-[22px] text-white shadow-[0_20px_40px_-24px_rgb(0_0_0/0.5)] transition-transform duration-300 hover:-translate-y-1',
                  status !== 'valid' && 'grayscale-[0.7]',
                )}
                style={{ background: COUPON_GRADIENTS[index % COUPON_GRADIENTS.length] }}
                onClick={() => openEdit(coupon)}
              >
                <div className="flex items-start justify-between gap-3 p-5 pb-4">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium tracking-wide text-white/70 uppercase">
                      Cupom
                    </div>
                    <div className="truncate font-mono text-[22px] font-bold tracking-wider">
                      {coupon.code}
                    </div>
                  </div>
                  <div onClick={(event) => event.stopPropagation()}>
                    <Switch
                      checked={coupon.active}
                      onCheckedChange={(checked: boolean) =>
                        toggleActive.mutate({ id: coupon.id, active: checked })
                      }
                      aria-label="Ativo"
                    />
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                    {formatDiscount(coupon)}
                    <span className="ml-1.5 text-[17px] font-semibold text-white/80">OFF</span>
                  </div>
                  {coupon.description && (
                    <p className="mt-2 line-clamp-2 text-[13px] text-white/80">
                      {coupon.description}
                    </p>
                  )}
                </div>

                {/* Perforated divider, like a Wallet pass */}
                <div className="relative my-4 border-t border-dashed border-white/35">
                  <span className="bg-background absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full" />
                  <span className="bg-background absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full" />
                </div>

                <div className="flex items-end justify-between gap-3 px-5 pb-5">
                  <div className="min-w-0 flex-1 text-[12px]">
                    <div className="mb-1 flex items-center gap-1.5 font-medium">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          status === 'valid' ? 'bg-white' : 'bg-white/50',
                        )}
                      />
                      {STATUS_LABEL[status]}
                      <span className="text-white/70">
                        ·{' '}
                        {coupon.expiresAt
                          ? `até ${new Intl.DateTimeFormat('pt-BR').format(new Date(coupon.expiresAt))}`
                          : 'sem validade'}
                      </span>
                    </div>
                    <div className="text-white/80 tabular-nums">
                      {coupon.usedCount}
                      {coupon.maxUses ? ` de ${coupon.maxUses}` : ''} usos
                    </div>
                    {usage !== null && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25">
                        <div
                          className="h-full rounded-full bg-white"
                          style={{ width: `${usage * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void navigator.clipboard?.writeText(coupon.code).then(
                        () => toast.success(`Código ${coupon.code} copiado`),
                        () => toast.error('Não foi possível copiar.'),
                      );
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-semibold backdrop-blur-md transition-colors hover:bg-white/30"
                  >
                    <CopyIcon className="size-3.5" />
                    Copiar
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <CouponDrawer open={drawerOpen} onOpenChange={setDrawerOpen} coupon={editingCoupon} />
    </div>
  );
}
