'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, type Control } from 'react-hook-form';
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
import { AbsencesEditor } from '@/components/profissionais/absences-editor';
import { ProfessionalAccessCard } from '@/components/profissionais/professional-access';
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
import type { z } from 'zod';
import type { SerializedProfessional } from '@/lib/serialize';
import { fileToAvatarDataUrl } from '@/lib/avatar';
import { InitialsAvatar } from '@/components/layout/list-controls';

const NO_COMMISSION = '__none__';

export function ProfessionalDrawer({
  open,
  onOpenChange,
  professional,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professional?: SerializedProfessional | null;
  /** Depois de criar, o painel fecha; quem chama oferece abrir de novo para o expediente. */
  onCreated?: (professional: SerializedProfessional) => void;
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
      monthlyGoal: professional?.monthlyGoal ?? null,
      avatarUrl: professional?.avatarUrl ?? null,
    },
  });

  const commissionType = form.watch('commissionType');

  const mutation = useMutation({
    mutationFn: (values: unknown) =>
      (isEdit
        ? updateProfessionalAction(professional.id, values)
        : createProfessionalAction(values)
      ).then(unwrapResult),
    onSuccess: (saved) => {
      upsertInList(queryClient, ['professionals'], saved);
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
      onOpenChange(false);
      if (isEdit) {
        toast.success('Profissional atualizado.');
        return;
      }
      if (onCreated) onCreated(saved);
      else toast.success('Profissional criado.');
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
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Foto (opcional)</FormLabel>
                  <AvatarField
                    value={field.value ?? null}
                    onChange={field.onChange}
                    control={form.control}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

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
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" inputMode="email" autoComplete="off" {...field} />
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
            <p className="text-label-secondary -mt-2 text-xs">
              O e-mail é opcional, mas sem ele o profissional não recebe o convite para ter login
              próprio (agenda e ganhos dele pelo celular).
            </p>

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

            <FormField
              control={form.control}
              name="monthlyGoal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta de faturamento no mês (R$, opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={50}
                      placeholder="Ex: 8000"
                      {...field}
                      value={(field.value as number) ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : e.target.value)
                      }
                    />
                  </FormControl>
                  <p className="text-label-secondary text-xs">
                    Aparece no painel, com o quanto já foi feito no mês.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expediente tem gravação própria: precisa do profissional já salvo. */}
            {isEdit ? (
              <>
                <ProfessionalAccessCard professionalId={professional.id} name={professional.name} />
                <AvailabilityEditor professionalId={professional.id} />
                <AbsencesEditor professionalId={professional.id} />
              </>
            ) : (
              <p className="text-label-secondary text-xs">
                Depois de criar, toque no profissional para definir o expediente da semana.
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

/** Foto do profissional: escolhe no aparelho (galeria ou câmera), reduz e mostra na hora. */
function AvatarField({
  value,
  onChange,
  control,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  control: Control<z.input<typeof professionalInput>>;
}) {
  // Só este campo acompanha nome e cor (para as iniciais): o resto do formulário não re-renderiza.
  const name = useWatch({ control, name: 'name' });
  const color = useWatch({ control, name: 'color' });
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToAvatarDataUrl(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível usar essa foto.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4">
      <InitialsAvatar
        name={name || '?'}
        color={color}
        imageUrl={value}
        className="size-16 text-[20px]"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Preparando...' : value ? 'Trocar foto' : 'Escolher foto'}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remover
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}
