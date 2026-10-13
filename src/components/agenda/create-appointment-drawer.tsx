'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';

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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import type { ConfirmationToSend } from '@/components/agenda/send-confirmation-dialog';
import {
  createAppointmentAction,
  findNextAvailableSlotAction,
} from '@/server/actions/agenda-actions';
import { createClientAction } from '@/server/actions/client-actions';
import {
  calendarDateToUtc,
  formatTimeInTz,
  utcToCalendarDate,
  utcToMinutesSinceMidnight,
} from '@/lib/time';
import {
  APPOINTMENTS_KEY,
  beginOptimistic,
  buildOptimisticAppointment,
  insertAppointment,
  rollbackOptimistic,
} from '@/components/agenda/agenda-cache';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';
import type { Client } from '@/generated/prisma/client';

const formSchema = z.object({
  clientId: z.string().min(1, 'Selecione um cliente'),
  professionalId: z.string().min(1, 'Selecione um profissional'),
  serviceId: z.string().min(1, 'Selecione um serviço'),
  date: z.string().min(1, 'Informe a data'),
  time: z.string().min(1, 'Informe o horário'),
  notes: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof formSchema>;

function toDateInputValue(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function toTimeInputValue(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function CreateAppointmentDrawer({
  open,
  onOpenChange,
  defaultStartAt,
  defaultProfessionalId,
  defaultClientId,
  defaultServiceId,
  clients,
  professionals,
  services,
  timezone,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe a mensagem de confirmação do cliente, para quem agendou poder enviá-la. */
  onCreated?: (confirmation: ConfirmationToSend) => void;
  defaultStartAt: Date;
  defaultProfessionalId?: string;
  /** Vêm preenchidos quando a pessoa começou pelo cartão rápido e clicou em "Mais opções". */
  defaultClientId?: string;
  defaultServiceId?: string;
  clients: Client[];
  professionals: SerializedProfessional[];
  services: SerializedService[];
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Cliente criado aqui ainda não está na lista que veio do servidor; entra na hora.
  const [createdClients, setCreatedClients] = React.useState<Client[]>([]);
  const [newClientOpen, setNewClientOpen] = React.useState(false);
  const [newClientName, setNewClientName] = React.useState('');
  const [newClientPhone, setNewClientPhone] = React.useState('');

  const defaultDate = React.useMemo(
    () => utcToCalendarDate(defaultStartAt, timezone),
    [defaultStartAt, timezone],
  );
  const defaultMinutes = React.useMemo(
    () => utcToMinutesSinceMidnight(defaultStartAt, timezone),
    [defaultStartAt, timezone],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      clientId: defaultClientId ?? '',
      professionalId: defaultProfessionalId ?? '',
      serviceId: defaultServiceId ?? '',
      date: toDateInputValue(defaultDate),
      time: toTimeInputValue(defaultMinutes),
      notes: '',
    },
  });

  // Recorrência: 0 = não repete; 1, 2 ou 4 semanas.
  const [repeatEvery, setRepeatEvery] = React.useState<0 | 1 | 2 | 4>(0);
  const [repeatTimes, setRepeatTimes] = React.useState(4);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const [year, month, day] = values.date.split('-').map(Number);
      const [hour, minute] = values.time.split(':').map(Number);
      const startAt = calendarDateToUtc({ year, month, day }, hour * 60 + minute, timezone);

      return unwrapResult(
        await createAppointmentAction({
          clientId: values.clientId,
          professionalId: values.professionalId,
          serviceId: values.serviceId,
          startAt,
          notes: values.notes,
          repeat: repeatEvery ? { everyWeeks: repeatEvery, times: repeatTimes } : undefined,
        }),
      );
    },
    // Otimista: o agendamento já está na grade (atrás da gaveta) quando o servidor confirma, então
    // ao fechar não há segunda espera. Se o servidor recusar, ele sai e a gaveta continua aberta.
    onMutate: async (values) => {
      const client = [...clients, ...createdClients].find((c) => c.id === values.clientId);
      const professional = professionals.find((p) => p.id === values.professionalId);
      const service = services.find((s) => s.id === values.serviceId);
      if (!client || !professional || !service) return { snapshot: undefined };
      const [year, month, day] = values.date.split('-').map(Number);
      const [hour, minute] = values.time.split(':').map(Number);
      const startAt = calendarDateToUtc({ year, month, day }, hour * 60 + minute, timezone);
      const snapshot = await beginOptimistic(queryClient);
      insertAppointment(
        queryClient,
        buildOptimisticAppointment({
          client,
          professional,
          service,
          startAt,
          notes: values.notes?.trim() || null,
        }),
      );
      return { snapshot };
    },
    onSuccess: (result) => {
      toast.success(
        result.repeated > 0
          ? `Agendamento criado e repetido mais ${result.repeated} vez(es).`
          : 'Agendamento criado com sucesso.',
      );
      if (result.skipped.length) {
        toast.warning(`Horário ocupado, não repetido em: ${result.skipped.join(', ')}.`);
      }
      setRepeatEvery(0);
      onOpenChange(false);
      form.reset();
      if (result.confirmation) onCreated?.(result.confirmation);
    },
    onError: (error: Error, _values, context) => {
      rollbackOptimistic(queryClient, context?.snapshot);
      toast.error(error.message || 'Não foi possível criar o agendamento.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  });

  const createClientMutation = useMutation({
    mutationFn: () =>
      createClientAction({
        name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
      }).then(unwrapResult),
    onSuccess: (client) => {
      setCreatedClients((list) => [...list, client]);
      // Entra também nas outras listas (Clientes e o cartão rápido) sem precisar recarregar.
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.refresh();
      form.setValue('clientId', client.id, { shouldValidate: true });
      setNewClientOpen(false);
      setNewClientName('');
      setNewClientPhone('');
      toast.success(`Cliente ${client.name} cadastrado.`);
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível cadastrar o cliente.'),
  });

  /** "Quando tem vaga?" — o primeiro horário em que o serviço cabe, com o profissional escolhido ou qualquer um. */
  const nextSlotMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(
        await findNextAvailableSlotAction({
          serviceId: form.getValues('serviceId'),
          professionalId: form.getValues('professionalId') || undefined,
          from: new Date(),
        }),
      ),
    onSuccess: (slot) => {
      if (!slot) {
        toast.info('Nenhum horário livre nos próximos 14 dias.');
        return;
      }
      const day = utcToCalendarDate(slot.startAt, timezone);
      form.setValue('date', toDateInputValue(day), { shouldValidate: true });
      form.setValue('time', formatTimeInTz(slot.startAt, timezone), { shouldValidate: true });
      form.setValue('professionalId', slot.professionalId, { shouldValidate: true });
      const name = professionals.find((p) => p.id === slot.professionalId)?.name;
      toast.success(
        `Próximo horário livre: ${String(day.day).padStart(2, '0')}/${String(day.month).padStart(2, '0')} às ${formatTimeInTz(slot.startAt, timezone)}${name ? ` com ${name}` : ''}.`,
      );
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível buscar horários.'),
  });

  const watchedServiceId = form.watch('serviceId');
  const watchedTime = form.watch('time');
  const selectedService = services.find((s) => s.id === watchedServiceId);

  const estimatedEndTime = React.useMemo(() => {
    if (!selectedService || !watchedTime) return null;
    const [hour, minute] = watchedTime.split(':').map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    const totalMinutes = hour * 60 + minute + selectedService.durationMinutes;
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMinute = totalMinutes % 60;
    return toTimeInputValue(endHour * 60 + endMinute);
  }, [selectedService, watchedTime]);

  const clientOptions: ComboboxOption[] = [...clients, ...createdClients].map((c) => ({
    value: c.id,
    label: c.name,
    description: c.phone ?? undefined,
  }));
  const professionalOptions: ComboboxOption[] = professionals.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const serviceOptions: ComboboxOption[] = services.map((s) => ({
    value: s.id,
    label: s.name,
    description: `${s.durationMinutes} min · ${formatCurrencyBRL(s.price)}`,
  }));

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>Novo agendamento</DrawerTitle>
          <DrawerDescription>Preencha os dados para criar um agendamento.</DrawerDescription>
        </DrawerHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Cliente</FormLabel>
                    <button
                      type="button"
                      onClick={() => setNewClientOpen((open) => !open)}
                      className="text-system-blue text-xs font-medium hover:underline"
                    >
                      {newClientOpen ? 'Escolher existente' : '+ Novo cliente'}
                    </button>
                  </div>
                  {newClientOpen ? (
                    // Cliente que liga pela primeira vez: cadastra aqui, sem sair da agenda.
                    <div className="bg-foreground/[0.03] ring-foreground/[0.06] flex flex-col gap-2 rounded-xl p-3 ring-1">
                      <Input
                        autoFocus
                        placeholder="Nome do cliente"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        maxLength={200}
                      />
                      <Input
                        placeholder="Telefone (opcional)"
                        inputMode="tel"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                        maxLength={30}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!newClientName.trim() || createClientMutation.isPending}
                        onClick={() => createClientMutation.mutate()}
                      >
                        {createClientMutation.isPending
                          ? 'Cadastrando...'
                          : 'Cadastrar e selecionar'}
                      </Button>
                    </div>
                  ) : (
                    <FormControl>
                      <Combobox
                        options={clientOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Selecionar cliente"
                        searchPlaceholder="Buscar cliente..."
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="professionalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profissional</FormLabel>
                  <FormControl>
                    <Combobox
                      options={professionalOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Selecionar profissional"
                      searchPlaceholder="Buscar profissional..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serviço</FormLabel>
                  <FormControl>
                    <Combobox
                      options={serviceOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Selecionar serviço"
                      searchPlaceholder="Buscar serviço..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="-mt-1 self-start"
              disabled={!watchedServiceId || nextSlotMutation.isPending}
              title={watchedServiceId ? undefined : 'Escolha o serviço primeiro'}
              onClick={() => nextSlotMutation.mutate()}
            >
              {nextSlotMutation.isPending ? 'Buscando...' : 'Próximo horário livre'}
            </Button>

            {estimatedEndTime && (
              <p className="text-muted-foreground -mt-2 text-xs">
                Termina às <span className="text-foreground font-medium">{estimatedEndTime}</span> (
                {selectedService!.durationMinutes} min de duração)
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Repetir</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    [0, 'Não repete'],
                    [1, 'Toda semana'],
                    [2, 'A cada 2 semanas'],
                    [4, 'A cada 4 semanas'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRepeatEvery(value)}
                    className={
                      repeatEvery === value
                        ? 'bg-foreground text-background rounded-full px-3 py-1.5 text-[12px] font-medium'
                        : 'bg-foreground/[0.06] hover:bg-foreground/[0.1] rounded-full px-3 py-1.5 text-[12px] font-medium'
                    }
                  >
                    {label}
                  </button>
                ))}
                {repeatEvery > 0 && (
                  <label className="text-label-secondary ml-1 flex items-center gap-1.5 text-[12px]">
                    vezes
                    <Input
                      type="number"
                      min={2}
                      max={12}
                      value={repeatTimes}
                      onChange={(e) =>
                        setRepeatTimes(Math.min(12, Math.max(2, Number(e.target.value) || 2)))
                      }
                      className="h-8 w-16"
                    />
                  </label>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Opcional" {...field} />
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
            {mutation.isPending ? 'Criando...' : 'Criar agendamento'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
