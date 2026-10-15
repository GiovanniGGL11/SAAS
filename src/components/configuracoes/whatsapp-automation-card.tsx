'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, MessageCircleIcon, XCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { unwrapResult } from '@/lib/action-result';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import {
  getWhatsappSettingsAction,
  removeZapiCredentialsAction,
  saveZapiCredentialsAction,
  sendTestMessageAction,
  setWhatsappAutomationAction,
  testZapiConnectionAction,
} from '@/server/actions/whatsapp-actions';

const AUTOMATIONS = [
  {
    key: 'waAutoConfirm',
    title: 'Confirmação ao marcar',
    hint: 'Assim que o horário é marcado (pela equipe ou pelo link), com o link para confirmar ou cancelar.',
  },
  {
    key: 'waAutoReminder',
    title: 'Lembrete na véspera',
    hint: 'Todo dia às 8h, para os horários do dia seguinte.',
  },
  {
    key: 'waAutoReview',
    title: 'Pedido de avaliação',
    hint: 'Logo depois de cobrar o atendimento.',
  },
  {
    key: 'waAutoBirthday',
    title: 'Parabéns no aniversário',
    hint: 'Às 8h do dia do aniversário, uma vez por ano.',
  },
] as const;

const KIND_LABEL: Record<string, string> = {
  CONFIRMATION: 'Confirmação',
  REMINDER: 'Lembrete',
  REVIEW: 'Avaliação',
  BIRTHDAY: 'Aniversário',
  CAMPAIGN: 'Campanha',
  TEST: 'Teste',
};

/** Conecta a Z-API (o WhatsApp do salão) e liga cada mensagem automática. */
export function WhatsappAutomationCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['whatsapp-settings'],
    queryFn: () => getWhatsappSettingsAction(),
  });
  const [instanceId, setInstanceId] = React.useState('');
  const [token, setToken] = React.useState('');
  const [clientToken, setClientToken] = React.useState('');
  const [testPhone, setTestPhone] = React.useState('');
  const [status, setStatus] = React.useState<{ connected: boolean; error: string | null } | null>(
    null,
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });

  const save = useMutation({
    mutationFn: () =>
      saveZapiCredentialsAction({
        instanceId: instanceId || data?.instanceId || '',
        token: token || undefined,
        clientToken: clientToken || undefined,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Credenciais salvas (cifradas).');
      setToken('');
      setClientToken('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => testZapiConnectionAction().then(unwrapResult),
    onSuccess: (s) => setStatus({ connected: s.connected, error: s.error }),
    onError: (e: Error) => setStatus({ connected: false, error: e.message }),
  });
  const sendTest = useMutation({
    mutationFn: () => sendTestMessageAction({ phone: testPhone }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Mensagem de teste enviada.');
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (input: { key: (typeof AUTOMATIONS)[number]['key']; enabled: boolean }) =>
      setWhatsappAutomationAction(input).then(unwrapResult),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => removeZapiCredentialsAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Z-API desconectada; envios automáticos desligados.');
      setStatus(null);
      refresh();
    },
  });

  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="bg-tile flex flex-col gap-5 rounded-[22px] p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white">
          <MessageCircleIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold">WhatsApp automático</h2>
          <p className="text-label-secondary text-[13px]">
            Mensagens que saem sozinhas do WhatsApp do salão, pela Z-API. Crie uma instância em
            z-api.io, conecte o celular do salão pelo QR code e cole aqui o ID, o token e o
            Client-Token (Segurança da conta).
          </p>
        </div>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input
          placeholder={data?.instanceId ? `ID: ${data.instanceId}` : 'ID da instância'}
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          aria-label="ID da instância"
          autoComplete="off"
        />
        <Input
          type="password"
          placeholder={
            data?.configured ? 'Token salvo (deixe vazio para manter)' : 'Token da instância'
          }
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-label="Token da instância"
          autoComplete="off"
        />
        <Input
          type="password"
          placeholder={data?.hasClientToken ? 'Client-Token salvo' : 'Client-Token (Segurança)'}
          value={clientToken}
          onChange={(e) => setClientToken(e.target.value)}
          aria-label="Client-Token"
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button
            type="submit"
            variant="outline"
            disabled={save.isPending || (!instanceId && !data?.instanceId)}
          >
            Salvar credenciais
          </Button>
          {data?.configured && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {test.isPending ? 'Testando...' : 'Testar conexão'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => remove.mutate()}
              >
                Desconectar
              </Button>
            </>
          )}
          {status && (
            <span
              className={cn(
                'flex items-center gap-1.5 text-[13px] font-medium',
                status.connected ? 'text-delta-good' : 'text-destructive',
              )}
            >
              {status.connected ? (
                <CheckCircle2Icon className="size-4" />
              ) : (
                <XCircleIcon className="size-4" />
              )}
              {status.connected ? 'Conectado' : status.error || 'Celular não conectado à instância'}
            </span>
          )}
        </div>
      </form>

      {data?.configured && (
        <>
          <ul className="divide-foreground/[0.06] divide-y">
            {AUTOMATIONS.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <div className="text-[15px] font-medium">{a.title}</div>
                  <div className="text-label-secondary text-[12px]">{a.hint}</div>
                </div>
                <Switch
                  checked={data.toggles[a.key]}
                  disabled={toggle.isPending}
                  aria-label={a.title}
                  onCheckedChange={(enabled: boolean) => toggle.mutate({ key: a.key, enabled })}
                />
              </li>
            ))}
          </ul>

          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendTest.mutate();
            }}
          >
            <Input
              className="w-56"
              inputMode="tel"
              placeholder="Seu WhatsApp com DDD"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={sendTest.isPending || testPhone.length < 10}
            >
              Enviar mensagem de teste
            </Button>
          </form>

          {data.recent.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Últimos envios</span>
              <ul className="flex flex-col gap-1 text-[12px]">
                {data.recent.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3">
                    <span className="text-label-secondary w-20 tabular-nums">
                      {date.format(new Date(m.createdAt))}
                    </span>
                    <span className="w-24">{KIND_LABEL[m.kind] ?? m.kind}</span>
                    <span className="text-label-secondary">{formatPhone(m.phone)}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        m.status === 'SENT'
                          ? 'text-delta-good'
                          : m.status === 'FAILED'
                            ? 'text-destructive'
                            : 'text-label-secondary',
                      )}
                      title={m.error ?? undefined}
                    >
                      {m.status === 'SENT'
                        ? 'Enviada'
                        : m.status === 'FAILED'
                          ? `Falhou${m.error ? `: ${m.error.slice(0, 60)}` : ''}`
                          : 'Enviando'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
