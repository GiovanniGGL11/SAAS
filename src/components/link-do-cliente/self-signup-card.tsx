'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CopyIcon, ExternalLinkIcon, MessageCircleIcon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { SIGNUP_FIELDS, type SignupConfig, type SignupFieldMode } from '@/lib/self-signup';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { saveSelfSignupSettingsAction } from '@/server/actions/self-signup-actions';

/**
 * Cadastro pelo link: o cliente preenche a própria ficha em /cadastro/[slug]. Nome e WhatsApp são
 * sempre pedidos; aqui o negócio escolhe o resto e copia ou manda o link.
 */
export function SelfSignupCard({
  initialEnabled,
  initialFields,
  url,
}: {
  initialEnabled: boolean;
  initialFields: SignupConfig;
  url: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [fields, setFields] = React.useState<SignupConfig>(initialFields);
  const dirty =
    enabled !== initialEnabled || JSON.stringify(fields) !== JSON.stringify(initialFields);

  const save = useMutation({
    mutationFn: () => saveSelfSignupSettingsAction({ enabled, fields }).then(unwrapResult),
    onSuccess: (r) => {
      toast.success(r.enabled ? 'Cadastro pelo link ligado.' : 'Cadastro pelo link desligado.');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const share = `Olá! Faça seu cadastro aqui, leva menos de um minuto: ${url}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
        <div className="flex items-start gap-3">
          <span className="bg-system-blue/12 text-system-blue flex size-9 shrink-0 items-center justify-center rounded-xl">
            <UserPlusIcon className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-[17px] font-semibold">Cadastro pelo link</h2>
            <p className="text-label-secondary text-[13px]">
              Mande o link e o cliente preenche a própria ficha. Quem já é cliente (mesmo WhatsApp)
              não é duplicado: só completa o que estiver em branco, nada do que você tem é trocado.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Cadastro pelo link" />
        </div>

        {enabled && (
          <div className="bg-background flex flex-col gap-3 rounded-2xl p-4">
            <code className="text-[13px] break-all">{url}</code>
            {initialEnabled && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"

                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success('Link copiado.');
                  }}
                >
                  <CopyIcon /> Copiar
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon /> Abrir
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(share)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircleIcon /> Mandar no WhatsApp
                  </a>
                </Button>
              </div>
            )}
            {!initialEnabled && (
              <p className="text-label-secondary text-[12px]">
                Salve para o link começar a funcionar.
              </p>
            )}
          </div>
        )}
      </section>

      {enabled && (
        <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
          <div>
            <h3 className="text-[15px] font-semibold">O que pedir</h3>
            <p className="text-label-secondary text-[13px]">
              Nome e WhatsApp são sempre pedidos. Escolha o resto — quanto menos, mais gente termina
              o cadastro.
            </p>
          </div>
          <ul className="divide-foreground/[0.06] flex flex-col divide-y">
            {SIGNUP_FIELDS.map((f) => (
              <li
                key={f.key}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-[14px]">{f.label}</span>
                <SegmentedControl
                  size="sm"
                  value={fields[f.key]}
                  onValueChange={(mode: SignupFieldMode) =>
                    setFields((cur) => ({ ...cur, [f.key]: mode }))
                  }
                  options={[
                    { value: 'off', label: 'Não pedir' },
                    { value: 'optional', label: 'Opcional' },
                    { value: 'required', label: 'Obrigatório' },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button
        className="self-start"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
}
