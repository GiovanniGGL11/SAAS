'use client';

import * as React from 'react';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColorPicker, PRESET_COLORS } from '@/components/ui/color-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createProfessionalAction,
  updateProfessionalAction,
} from '@/server/actions/professional-actions';
import { professionalInput } from '@/lib/validations/professional';
import type { SerializedProfessional } from '@/lib/serialize';

const NO_COMMISSION = '__none__';

export function ProfessionalDrawer({
  open,
  onOpenChange,
  professional,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professional?: SerializedProfessional | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!professional;

  const form = useForm({
    resolver: zodResolver(professionalInput),
    values: {
      name: professional?.name ?? '',
      email: professional?.email ?? '',
      phone: professional?.phone ?? '',
      color: professional?.color ?? PRESET_COLORS[1],
      commissionType: professional?.commissionType ?? null,
      commissionValue: professional?.commissionValue ?? null,
    },
  });

  const commissionType = form.watch('commissionType');

  const mutation = useMutation({
    mutationFn: (values: unknown) =>
      isEdit ? updateProfessionalAction(professional.id, values) : createProfessionalAction(values),
    onSuccess: () => {
      toast.success(isEdit ? 'Profissional atualizado.' : 'Profissional criado.');
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Editar profissional' : 'Novo profissional'}</DrawerTitle>
          <DrawerDescription>
            {isEdit ? 'Atualize os dados do profissional.' : 'Cadastre um novo profissional.'}
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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (opcional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor</FormLabel>
                  <FormControl>
                    <ColorPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="commissionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comissão</FormLabel>
                    <Select
                      value={field.value ?? NO_COMMISSION}
                      onValueChange={(value: string) =>
                        field.onChange(value === NO_COMMISSION ? null : value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_COMMISSION}>Sem comissão</SelectItem>
                        <SelectItem value="FIXED">Valor fixo</SelectItem>
                        <SelectItem value="PERCENTAGE">Percentual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {commissionType && (
                <FormField
                  control={form.control}
                  name="commissionValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {commissionType === 'PERCENTAGE' ? 'Percentual (%)' : 'Valor (R$)'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          value={(field.value as number) ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </form>
        </Form>

        <DrawerFooter>
          <Button
            onClick={form.handleSubmit((values) => mutation.mutate(values))}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Salvando...'
              : isEdit
                ? 'Salvar alterações'
                : 'Criar profissional'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
