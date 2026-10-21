'use client';

import { PRICE_KINDS } from '@/lib/catalog';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CustomFieldsEditor } from '@/components/custom-fields/custom-fields-editor';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ColorPicker, PRESET_COLORS } from '@/components/ui/color-picker';
import {
  createServiceAction,
  getServiceSuppliesAction,
  updateServiceAction,
} from '@/server/actions/service-actions';
import { ServiceSuppliesField, type SupplyRow } from '@/components/servicos/service-supplies-field';
import { serviceInput, type ServiceFormInput } from '@/lib/validations/service';
import { usePlanFeatures } from '@/components/plan/use-plan-features';
import type { SerializedService } from '@/lib/serialize';

export function ServiceDrawer({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: SerializedService | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!service;

  const form = useForm({
    resolver: zodResolver(serviceInput),
    values: {
      name: service?.name ?? '',
      description: service?.description ?? '',
      category: service?.category ?? '',
      durationMinutes: service?.durationMinutes ?? 30,
      price: service?.price ?? 0,
      color: service?.color ?? PRESET_COLORS[0],
      commissionPercent: service?.commissionPercent ?? null,
      returnAfterDays: service?.returnAfterDays ?? null,
      priceKind: (service?.priceKind ?? 'fixed') as 'fixed' | 'from' | 'on_request',
      publicVisible: service?.publicVisible ?? true,
    },
  });

  // Materiais: o que já está salvo (ao editar) e o que a pessoa mudou nesta abertura.
  const { data: savedSupplies } = useQuery({
    queryKey: ['service-supplies', service?.id],
    queryFn: () => getServiceSuppliesAction(service!.id),
    enabled: open && isEdit,
  });
  const [editedSupplies, setEditedSupplies] = React.useState<SupplyRow[] | null>(null);
  // Checklist: um item por linha; `null` = a pessoa não mexeu (ao editar, mantém o atual).
  const { has } = usePlanFeatures();
  const [editedChecklist, setEditedChecklist] = React.useState<string | null>(null);
  const checklistText = editedChecklist ?? (service?.checklistItems ?? []).join('\n');
  const supplies: SupplyRow[] =
    editedSupplies ??
    (savedSupplies ?? []).map((s) => ({ productId: s.productId, quantity: s.quantity }));

  const mutation = useMutation({
    mutationFn: (values: ServiceFormInput) => {
      const payload = {
        ...values,
        // Sem mexer na lista, ao editar, mantém a atual (undefined); linhas sem produto são ignoradas.
        supplies:
          editedSupplies === null && isEdit
            ? undefined
            : supplies
                .filter((row) => row.productId)
                .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) || 0 })),
        checklistItems:
          editedChecklist === null
            ? undefined
            : [
                ...new Set(
                  editedChecklist
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                ),
              ],
      };
      return (
        isEdit ? updateServiceAction(service.id, payload) : createServiceAction(payload)
      ).then(unwrapResult);
    },
    onSuccess: (saved) => {
      upsertInList(queryClient, ['services'], saved);
      toast.success(isEdit ? 'Serviço atualizado.' : 'Serviço criado.');
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service-supplies'] });
      setEditedSupplies(null);
      setEditedChecklist(null);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEditedSupplies(null);
          setEditedChecklist(null);
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Editar serviço' : 'Novo serviço'}</DrawerTitle>
          <DrawerDescription>
            {isEdit ? 'Atualize os dados do serviço.' : 'Cadastre um novo serviço oferecido.'}
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
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Consultas, Pacotes, Avançados..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (min)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={5}
                        step={5}
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
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço (R$)</FormLabel>
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

            <FormField
              control={form.control}
              name="returnAfterDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sugerir retorno após (dias, opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={365}
                      step={1}
                      placeholder="Ex.: 21 · vazio = sem sugestão"
                      {...field}
                      value={(field.value as number) ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : e.target.value)
                      }
                    />
                  </FormControl>
                  <p className="text-label-secondary text-[12px]">
                    Quem fez este serviço aparece em &ldquo;Hora de voltar&rdquo; no painel quando
                    chegar a data.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commissionPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comissão deste serviço (%, opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      placeholder="Vazio = regra de cada profissional"
                      {...field}
                      value={(field.value as number) ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : e.target.value)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="priceKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Como mostrar o preço</FormLabel>
                    <Select value={field.value ?? 'fixed'} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(PRICE_KINDS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="publicVisible"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 pt-6">
                    <FormLabel>Aparece no agendamento online</FormLabel>
                    <FormControl>
                      <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <ServiceSuppliesField value={supplies} onChange={setEditedSupplies} />

            {/* Respostas salvas à parte (o serviço precisa existir antes). */}
            {isEdit && <CustomFieldsEditor entity="service" recordId={service.id} />}

            {has('checklists') && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Checklist do atendimento</span>
                <span className="text-label-secondary text-[12px]">
                  Um item por linha. Aparece na Visão do atendimento para a equipe conferir.
                </span>
                <Textarea
                  rows={3}
                  value={checklistText}
                  placeholder={'Ex.: Conferir alergias\nHigienizar equipamento'}
                  onChange={(e) => setEditedChecklist(e.target.value)}
                />
              </label>
            )}

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
          </form>
        </Form>

        <DrawerFooter>
          <Button
            onClick={form.handleSubmit((values) => mutation.mutate(values))}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar serviço'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
