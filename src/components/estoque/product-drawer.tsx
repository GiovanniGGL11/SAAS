'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createProductAction, updateProductAction } from '@/server/actions/stock-actions';
import { productInput } from '@/lib/validations/stock';
import type { SerializedProduct } from '@/lib/serialize';

export function ProductDrawer({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: SerializedProduct | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!product;

  const form = useForm({
    resolver: zodResolver(productInput),
    values: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      description: product?.description ?? '',
      costPrice: product?.costPrice ?? 0,
      salePrice: product?.salePrice ?? 0,
      quantity: product?.quantity ?? 0,
      minQuantity: product?.minQuantity ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) =>
      isEdit ? updateProductAction(product.id, values) : createProductAction(values),
    onSuccess: () => {
      toast.success(isEdit ? 'Produto atualizado.' : 'Produto criado.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Editar produto' : 'Novo produto'}</DrawerTitle>
          <DrawerDescription>
            {isEdit ? 'Atualize os dados do produto.' : 'Cadastre um novo produto no estoque.'}
          </DrawerDescription>
        </DrawerHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Código interno" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço de custo (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        {...field}
                        value={field.value as number}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço de venda (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        {...field}
                        value={field.value as number}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque inicial</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        disabled={isEdit}
                        {...field}
                        value={field.value as number}
                      />
                    </FormControl>
                    {isEdit && (
                      <p className="text-muted-foreground text-xs">
                        Ajuste o estoque em &ldquo;Nova movimentação&rdquo;.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque mínimo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        {...field}
                        value={field.value as number}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DrawerFooter>
          <Button
            onClick={form.handleSubmit((values) => mutation.mutate(values))}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar produto'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
