'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';

import { formatPhone } from '@/lib/phone';
import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateCompanyWhatsappAction } from '@/server/actions/company-actions';

/** Área do cliente: o WhatsApp onde chegam os pedidos de acesso e o link de entrada para divulgar. */
export function ClientAreaCard({
  initialWhatsapp,
  entryUrl,
}: {
  initialWhatsapp: string | null;
  entryUrl: string;
}) {
  const [saved, setSaved] = React.useState(initialWhatsapp);
  const [value, setValue] = React.useState(initialWhatsapp ? formatPhone(initialWhatsapp) : '');

  const mutation = useMutation({
    mutationFn: () => updateCompanyWhatsappAction({ whatsapp: value }).then(unwrapResult),
    onSuccess: ({ whatsapp }) => {
      setSaved(whatsapp);
      setValue(whatsapp ? formatPhone(whatsapp) : '');
      toast.success(whatsapp ? 'WhatsApp salvo.' : 'WhatsApp removido.');
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  const dirty = value.replace(/\D/g, '') !== (saved ?? '').replace(/^55(?=\d{10,11}$)/, '');

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Área do cliente</h2>
        <p className="text-label-secondary text-[13px]">
          Cada cliente vê os próprios horários, confirma, remarca, cancela e acompanha a fidelidade
          por um link pessoal. Para mandar o link, abra a ficha do cliente e toque em{' '}
          <span className="text-foreground font-medium">Área do cliente</span>.
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Label htmlFor="company-whatsapp">WhatsApp da empresa</Label>
        <div className="flex gap-2">
          <Input
            id="company-whatsapp"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 98888-7777"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="sm:max-w-64"
          />
          <Button type="submit" disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
        <p className="text-label-secondary text-[12px]">
          Quem ainda não tem o link toca em &ldquo;Pedir acesso&rdquo; e cai neste WhatsApp, com a
          mensagem pronta.
        </p>
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Link de entrada para divulgar</span>
        <div className="bg-background ring-foreground/[0.06] flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1">
          <code className="min-w-0 flex-1 truncate text-[13px]">{entryUrl}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(entryUrl);
              toast.success('Link copiado. Coloque na bio do Instagram.');
            }}
          >
            <CopyIcon className="size-4" /> Copiar
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={entryUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-4" /> Abrir
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
