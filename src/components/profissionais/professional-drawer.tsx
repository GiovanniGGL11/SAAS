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
import { unwrapResult } from '@/lib/action-result';
import { upsertInList } from '@/lib/query-cache';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvailabilityEditor } from '@/components/profissionais/availability-editor';
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
  // Recém-criado nesta abertura: o painel continua aberto para definir o expediente na sequência.
  const [justCreatedId, setJustCreatedId] = React.useState<string | null>(null);
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
      (isEdit || justCreatedId
        ? updateProfessionalAction(professional?.id ?? justCreatedId!, values)
        : createProfessionalAction(values)
      ).then(unwrapResult),
    onSuccess: (saved) => {
      upsertInList(queryClient, ['professionals'], saved);
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
      if (!isEdit && !justCreatedId) {
        toast.success('Profissional criado. Agora defina o expediente.');
        setJustCreatedId(saved.id);
        return;
      }
      toast.success(isEdit ? 'Profissional atualizado.' : 'Profissional criado.');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(next) => {
        if (!next) setJustCreatedId(null);
        onOpenChange(next);
      }}
    >
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

            {/* Expediente tem gravação própria: precisa do profissional já salvo. */}
            {isEdit || justCreatedId ? (
              <AvailabilityEditor professionalId={professional?.id ?? justCreatedId!} />
            ) : (
              <p className="text-label-secondary text-xs">
                Ao salvar, o expediente da semana aparece aqui para você definir.
              </p>
            )}
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
