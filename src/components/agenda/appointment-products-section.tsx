'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  listActiveProductsAction,
  listAppointmentProductsAction,
  sellProductAction,
} from '@/server/actions/stock-actions';
import { formatCurrencyBRL } from '@/lib/serialize';

export function AppointmentProductsSection({
  appointmentId,
  readOnly,
}: {
  appointmentId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);

  const { data: soldItems } = useQuery({
    queryKey: ['appointment-products', appointmentId],
    queryFn: () => listAppointmentProductsAction(appointmentId),
  });

  const { data: products } = useQuery({
    queryKey: ['active-products'],
    queryFn: listActiveProductsAction,
    enabled: !readOnly,
  });

  const sellMutation = useMutation({
    mutationFn: () => sellProductAction({ appointmentId, productId, quantity }),
    onSuccess: () => {
      toast.success('Produto adicionado ao atendimento.');
      queryClient.invalidateQueries({ queryKey: ['appointment-products', appointmentId] });
      setProductId('');
      setQuantity(1);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível adicionar.'),
  });

  const productOptions: ComboboxOption[] = (products ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    description: `${formatCurrencyBRL(p.salePrice)} · ${p.quantity} em estoque`,
  }));

  if (readOnly && (!soldItems || soldItems.length === 0)) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">Produtos vendidos</span>

      {soldItems && soldItems.length > 0 && (
        <div className="flex flex-col gap-1">
          {soldItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <span>
                {item.product.name} × {item.quantity}
              </span>
              <span className="text-muted-foreground">
                {formatCurrencyBRL(item.priceSnapshot * item.quantity)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Combobox
              options={productOptions}
              value={productId}
              onChange={setProductId}
              placeholder="Adicionar produto"
              searchPlaceholder="Buscar produto..."
            />
          </div>
          <Input
            type="number"
            min={1}
            step={1}
            className="w-16"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!productId || quantity < 1 || sellMutation.isPending}
            onClick={() => sellMutation.mutate()}
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
