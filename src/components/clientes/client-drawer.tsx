'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { upsertInList } from '@/lib/query-cache';
import { Loader2Icon } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  createClientAction,
  listClientsAction,
  updateClientAction,
} from '@/server/actions/client-actions';
import { Combobox } from '@/components/ui/combobox';
import { clientInput } from '@/lib/validations/client';
import { formatCep, lookupCep, type CepAddress } from '@/lib/address';
import type { Client } from '@/generated/prisma/client';

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  // Gravada como meia-noite UTC: ler em UTC, senão o fuso do Brasil mostra o dia anterior.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function ClientDrawer({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!client;

  const form = useForm({
    resolver: zodResolver(clientInput),
    values: {
      name: client?.name ?? '',
      phone: client?.phone ?? '',
      email: client?.email ?? '',
      cpf: client?.cpf ?? '',
      birthDate: client?.birthDate ? new Date(client.birthDate) : undefined,
      notes: client?.notes ?? '',
      zipCode: formatCep(client?.zipCode),
      street: client?.street ?? '',
      number: client?.number ?? '',
      complement: client?.complement ?? '',
      district: client?.district ?? '',
      city: client?.city ?? '',
      state: client?.state ?? '',
      referredById: client?.referredById ?? null,
    },
  });
  // Lista para "Indicado por" (programa de indicação); só carrega com a gaveta aberta.
  const { data: allClients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => listClientsAction(),
    enabled: open,
  });

  const [cepStatus, setCepStatus] = React.useState<'idle' | 'loading' | 'notFound' | 'failed'>(
    'idle',
  );
  // O que a última busca preencheu: só esses valores podem ser trocados por uma busca nova;
  // o que a pessoa digitou à mão (ou já estava salvo) fica como está.
  const autoFilled = React.useRef<Partial<CepAddress>>({});
  const cepRequest = React.useRef<AbortController | null>(null);

  // Ao fechar, a próxima abertura começa sem aviso de CEP nem busca pendente.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setCepStatus('idle');
  }
  React.useEffect(() => {
    if (!open) {
      cepRequest.current?.abort();
      autoFilled.current = {};
    }
  }, [open]);

  async function onCepChange(raw: string) {
    const masked = formatCep(raw);
    form.setValue('zipCode', masked, { shouldDirty: true });
    cepRequest.current?.abort();
    const digits = masked.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepStatus('idle');
      return;
    }
    const controller = new AbortController();
    cepRequest.current = controller;
    setCepStatus('loading');
    try {
      const address = await lookupCep(digits, controller.signal);
      if (controller.signal.aborted) return;
      if (!address) {
        setCepStatus('notFound');
        return;
      }
      for (const key of ['street', 'district', 'city', 'state'] as const) {
        const current = form.getValues(key)?.trim() ?? '';
        if (!address[key]) continue;
        if (current && current !== autoFilled.current[key]) continue;
        form.setValue(key, address[key], { shouldDirty: true });
        autoFilled.current[key] = address[key];
      }
      setCepStatus('idle');
    } catch {
      if (!controller.signal.aborted) setCepStatus('failed');
    }
  }

  const mutation = useMutation({
    mutationFn: (values: unknown) =>
      (isEdit ? updateClientAction(client.id, values) : createClientAction(values)).then(
        unwrapResult,
      ),
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Cliente atualizado.' : 'Cliente criado.');
      // A ação devolve o cliente salvo: entra na lista (e na ficha) na hora, sem esperar nova busca.
      upsertInList(queryClient, ['clients'], saved);
      queryClient.setQueryData<{ client: typeof saved }>(['client-detail', saved.id], (data) =>
        data ? { ...data, client: saved } : data,
      );
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-detail', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['client-referrals'] });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Editar cliente' : 'Novo cliente'}</DrawerTitle>
          <DrawerDescription>
            {isEdit ? 'Atualize os dados do cliente.' : 'Cadastre um novo cliente.'}
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={toDateInputValue(field.value as Date | undefined)}
                        onChange={(e) =>
                          field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-label-secondary text-[13px] font-medium">Endereço (opcional)</h3>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            inputMode="numeric"
                            autoComplete="postal-code"
                            placeholder="00000-000"
                            maxLength={9}
                            onChange={(e) => void onCepChange(e.target.value)}
                          />
                          {cepStatus === 'loading' && (
                            <Loader2Icon
                              aria-label="Buscando CEP"
                              className="text-label-secondary absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                            />
                          )}
                        </div>
                      </FormControl>
                      {cepStatus === 'notFound' && (
                        <p className="text-system-red text-[12px]">CEP não encontrado.</p>
                      )}
                      {cepStatus === 'failed' && (
                        <p className="text-system-red text-[12px]">
                          Não foi possível buscar o CEP. Preencha à mão.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="address-level2" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rua</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="address-line1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input {...field} inputMode="numeric" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="complement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Complemento</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="address-line2" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-3">
                <FormField
                  control={form.control}
                  name="district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UF</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          maxLength={2}
                          autoComplete="address-level1"
                          className="uppercase"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="referredById"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Indicado por (opcional)</FormLabel>
                  <FormControl>
                    <Combobox
                      options={(allClients ?? [])
                        .filter((c) => c.id !== client?.id && c.active)
                        .map((c) => ({
                          value: c.id,
                          label: c.name,
                          description: c.phone ?? undefined,
                        }))}
                      value={field.value ?? ''}
                      onChange={(value) => field.onChange(value || null)}
                      placeholder="Ninguém"
                      searchPlaceholder="Buscar cliente..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (opcional)</FormLabel>
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
            {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar cliente'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
