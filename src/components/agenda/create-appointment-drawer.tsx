'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { createAppointmentAction } from '@/server/actions/agenda-actions';
import { calendarDateToUtc, utcToCalendarDate, utcToMinutesSinceMidnight } from '@/lib/time';
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
  clients,
  professionals,
  services,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStartAt: Date;
  defaultProfessionalId?: string;
  clients: Client[];
  professionals: SerializedProfessional[];
  services: SerializedService[];
  timezone: string;
}) {
  const queryClient = useQueryClient();

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
      clientId: '',
      professionalId: defaultProfessionalId ?? '',
      serviceId: '',
      date: toDateInputValue(defaultDate),
      time: toTimeInputValue(defaultMinutes),
      notes: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const [year, month, day] = values.date.split('-').map(Number);
      const [hour, minute] = values.time.split(':').map(Number);
      const startAt = calendarDateToUtc({ year, month, day }, hour * 60 + minute, timezone);

      return createAppointmentAction({
        clientId: values.clientId,
        professionalId: values.professionalId,
        serviceId: values.serviceId,
        startAt,
        notes: values.notes,
      });
    },
    onSuccess: () => {
      toast.success('Agendamento criado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível criar o agendamento.');
    },
  });

  const clientOptions: ComboboxOption[] = clients.map((c) => ({
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
                  <FormLabel>Cliente</FormLabel>
                  <FormControl>
                    <Combobox
                      options={clientOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Selecionar cliente"
                      searchPlaceholder="Buscar cliente..."
                    />
                  </FormControl>
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
