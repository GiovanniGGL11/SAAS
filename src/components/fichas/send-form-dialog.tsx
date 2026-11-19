'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  CopyIcon,
  MessageCircleIcon,
  SearchIcon,
  UserPlusIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { unwrapResult } from '@/lib/action-result';
import {
  createClientAndSendFormAction,
  findClientForFormAction,
  listTemplatesAction,
  sendFormToClientAction,
  sendSignupInviteAction,
} from '@/server/actions/form-actions';

type Step =
  | { kind: 'phone' }
  | { kind: 'found'; client: { id: string; name: string } }
  | { kind: 'not-found' }
  | { kind: 'new-client' }
  | { kind: 'name' }
  | { kind: 'sent'; message: string; via: 'form' | 'invite'; opened: boolean; hasPhone: boolean };

type SendResult = { kind: 'form' | 'invite'; message: string; whatsappUrl: string | null };

/**
 * "Enviar ficha pelo WhatsApp" pelo telefone: consulta se o número já é cliente. Se não for,
 * pergunta se é cliente novo e se quer mandar junto o cadastro (a pessoa se cadastra e segue para
 * a ficha num link só). Nada é enviado sozinho: abre o WhatsApp com a mensagem pronta.
 */
export function SendFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: templates } = useQuery({
    queryKey: ['form-templates', false],
    queryFn: () => listTemplatesAction({ includeArchived: false }),
    enabled: open,
  });
  const usable = React.useMemo(
    () =>
      (templates ?? [])
        .filter((t) => t.status === 'ACTIVE' && t.fillableBy !== 'PROFESSIONAL')
        // Anamneses primeiro.
        .sort((a, b) => Number(b.type === 'ANAMNESIS') - Number(a.type === 'ANAMNESIS')),
    [templates],
  );
  const [templateId, setTemplateId] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [step, setStep] = React.useState<Step>({ kind: 'phone' });
  const chosen = templateId || usable[0]?.id || '';

  const reset = () => {
    setStep({ kind: 'phone' });
    setPhone('');
    setName('');
  };

  const lookup = useMutation({
    mutationFn: () => findClientForFormAction({ phone }).then(unwrapResult),
    onSuccess: (r) =>
      setStep(r.client ? { kind: 'found', client: r.client } : { kind: 'not-found' }),
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: async (vars: { run: () => Promise<SendResult>; win: Window | null }) => vars.run(),
    onSuccess: (r, vars) => {
      let opened = false;
      if (r.whatsappUrl && vars.win) {
        vars.win.location.href = r.whatsappUrl;
        opened = true;
      } else {
        vars.win?.close();
      }
      setStep({
        kind: 'sent',
        message: r.message,
        via: r.kind,
        opened,
        hasPhone: Boolean(r.whatsappUrl),
      });
    },
    onError: (e: Error, vars) => {
      vars.win?.close();
      toast.error(e.message);
    },
  });

  /** Abre a janela já no clique (depois, o navegador bloquearia) e só então prepara o link. */
  const go = (run: () => Promise<SendResult>) => {
    const win = window.open('', '_blank');
    send.mutate({ run, win });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem copiada. Cole no WhatsApp do cliente.');
    } catch {
      toast.error('Não deu para copiar. Selecione o texto e copie.');
    }
  };

  const templateName = usable.find((t) => t.id === chosen)?.name ?? 'a ficha';

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar ficha pelo WhatsApp</DialogTitle>
          <DialogDescription>
            O cliente preenche e assina pelo celular. Nada é enviado sozinho: o WhatsApp abre com a
            mensagem pronta.
          </DialogDescription>
        </DialogHeader>

        {usable.length === 0 && templates ? (
          <p className="text-label-secondary text-[14px]">
            Nenhum modelo que o cliente possa preencher. Crie uma anamnese na aba Modelos.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {step.kind !== 'sent' && (
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">Ficha</span>
                <Select value={chosen} onValueChange={(v: string) => setTemplateId(v)}>
                  <SelectTrigger aria-label="Ficha">
                    <SelectValue placeholder="Escolha a ficha" />
                  </SelectTrigger>
                  <SelectContent>
                    {usable.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}

            {step.kind === 'phone' && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phone.replace(/\D/g, '').length >= 10) lookup.mutate();
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium">WhatsApp do cliente</span>
                  <Input
                    inputMode="tel"
                    autoFocus
                    placeholder="(11) 98888-7777"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={phone.replace(/\D/g, '').length < 10 || lookup.isPending || !chosen}
                >
                  <SearchIcon /> {lookup.isPending ? 'Consultando...' : 'Consultar número'}
                </Button>
              </form>
            )}

            {step.kind === 'found' && (
              <div className="flex flex-col gap-3">
                <div className="bg-system-green/[0.08] flex items-center gap-2 rounded-xl p-3 text-[14px]">
                  <CheckCircle2Icon className="text-system-green size-4 shrink-0" />
                  <span>
                    Já é cliente: <strong>{step.client.name}</strong>
                  </span>
                </div>
                <Button
                  disabled={send.isPending}
                  onClick={() =>
                    go(() =>
                      sendFormToClientAction({
                        clientId: step.client.id,
                        templateId: chosen,
                      }).then(unwrapResult),
                    )
                  }
                >
                  <MessageCircleIcon /> Enviar {templateName} pelo WhatsApp
                </Button>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Outro número
                </Button>
              </div>
            )}

            {step.kind === 'not-found' && (
              <div className="flex flex-col gap-3">
                <p className="text-[14px]">
                  Este número ainda não está cadastrado. <strong>É um cliente novo?</strong>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setStep({ kind: 'new-client' })}>
                    <UserPlusIcon /> Sim, cliente novo
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    Não
                  </Button>
                </div>
                <p className="text-label-secondary text-[12px]">
                  Já é cliente com outro número? Procure pelo nome em{' '}
                  <Link href="/clientes" className="text-system-blue underline">
                    Clientes
                  </Link>{' '}
                  e mande a ficha pela ficha dele, ou corrija o telefone no cadastro.
                </p>
              </div>
            )}

            {step.kind === 'new-client' && (
              <div className="flex flex-col gap-3">
                <p className="text-[14px]">
                  <strong>Enviar junto o cadastro?</strong> A pessoa preenche o próprio cadastro
                  (nome, contato e o que você pede no cadastro pelo link) e, em seguida, a ficha. Ao
                  enviar, ela já fica cadastrada como cliente.
                </p>
                <Button
                  disabled={send.isPending}
                  onClick={() =>
                    go(() =>
                      sendSignupInviteAction({ phone, templateId: chosen }).then(unwrapResult),
                    )
                  }
                >
                  <MessageCircleIcon /> Sim, enviar cadastro + ficha
                </Button>
                <Button variant="outline" onClick={() => setStep({ kind: 'name' })}>
                  Não, só a ficha
                </Button>
              </div>
            )}

            {step.kind === 'name' && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim().length < 2) return;
                  go(() =>
                    createClientAndSendFormAction({ phone, name, templateId: chosen }).then(
                      unwrapResult,
                    ),
                  );
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium">Nome do cliente</span>
                  <Input
                    autoFocus
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como o cliente se chama"
                  />
                </label>
                <span className="text-label-secondary text-[12px]">
                  O cliente entra no sistema com nome e telefone; o resto você completa depois.
                </span>
                <Button type="submit" disabled={name.trim().length < 2 || send.isPending}>
                  <MessageCircleIcon /> Cadastrar e enviar pelo WhatsApp
                </Button>
              </form>
            )}

            {step.kind === 'sent' && (
              <div className="flex flex-col gap-3">
                <div className="bg-system-green/[0.08] flex items-start gap-2 rounded-xl p-3 text-[14px]">
                  <CheckCircle2Icon className="text-system-green mt-0.5 size-4 shrink-0" />
                  <span>
                    {step.via === 'invite'
                      ? 'Convite pronto: cadastro e ficha num link só (vale 7 dias).'
                      : 'Ficha pedida. O link vale 7 dias.'}{' '}
                    {step.opened
                      ? 'Confira a mensagem no WhatsApp e toque em enviar.'
                      : step.hasPhone
                        ? 'O navegador bloqueou a janela: copie a mensagem abaixo.'
                        : 'Copie a mensagem abaixo e mande para o cliente.'}
                  </span>
                </div>
                <p className="bg-foreground/[0.03] rounded-lg p-2 text-[12px] whitespace-pre-wrap select-all">
                  {step.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => copy(step.message)}>
                    <CopyIcon /> Copiar mensagem
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Enviar para outro número
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
