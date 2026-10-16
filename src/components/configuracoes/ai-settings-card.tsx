'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { AUTONOMY_LABEL, type AutonomyMode } from '@/lib/billing/entitlements';
import { Button } from '@/components/ui/button';
import {
  getAiSettingsAction,
  getAiStatusAction,
  setAuthorizationStatusAction,
  setAutonomyModeAction,
} from '@/server/actions/assistant-actions';

const MODES: { value: AutonomyMode; description: string }[] = [
  { value: 'SUGGEST', description: 'Consulta e sugere. Não prepara alterações.' },
  { value: 'APPROVAL', description: 'Prepara alterações e executa só depois da sua confirmação.' },
  {
    value: 'AUTO_RULES',
    description: 'Só no Pro: executa sozinha apenas rotinas autorizadas, dentro de limites.',
  },
];

/** IA da empresa: situação no plano, consumo do mês, modo de autonomia e autorizações. */
export function AiSettingsCard() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => getAiStatusAction(),
  });
  const { data: settings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => getAiSettingsAction().then(unwrapResult),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
  };
  const setMode = useMutation({
    mutationFn: (mode: AutonomyMode) => setAutonomyModeAction({ mode }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Modo de autonomia salvo.');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setAuth = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'PAUSED' | 'REVOKED' }) =>
      setAuthorizationStatusAction(input).then(unwrapResult),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!status) return null;
  const stored = status.autonomy.stored;
  const effective = status.autonomy.effective;

  return (
    <section
      className="bg-tile flex flex-col gap-4 rounded-[22px] p-5 md:p-6"
      aria-labelledby="ai-settings-title"
    >
      <div className="flex items-start gap-3">
        <SparklesIcon className="text-system-blue mt-1 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 id="ai-settings-title" className="text-[17px] font-semibold">
            Inteligência artificial
          </h2>
          <p className="text-label-secondary text-[13px]">
            {status.planName ? `Plano ${status.planName}` : 'Sem plano ativo'}
            {status.source === 'trial' ? ' (teste grátis)' : ''}
          </p>
        </div>
      </div>

      {!status.includedInPlan ? (
        <div className="flex flex-col gap-2 text-[14px]">
          <p>O assistente de IA está disponível nos planos Profissional e Pro.</p>
          <Button variant="outline" size="sm" className="self-start" asChild>
            <Link href="/assinatura">Conhecer os planos</Link>
          </Button>
        </div>
      ) : (
        <>
          {!status.assistant && status.assistantMessage && (
            <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2 text-[13px]">
              {status.assistantMessage}
            </p>
          )}
          {status.usage && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[13px]">
                <span>Uso de IA neste mês</span>
                <span className="tabular-nums">
                  {status.usage.used} de {status.usage.limit}
                </span>
              </div>
              <div
                className="bg-foreground/[0.08] h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={status.usage.limit}
                aria-valuenow={status.usage.used}
                aria-label="Uso de IA neste mês"
              >
                <div
                  className="bg-system-blue h-full"
                  style={{
                    width: `${status.usage.limit ? Math.min(100, (status.usage.used / status.usage.limit) * 100) : 0}%`,
                  }}
                />
              </div>
              {status.provisionalUnits && (
                <p className="text-label-secondary text-[12px]">
                  Limite provisório de desenvolvimento: a franquia do plano ainda não foi definida.
                </p>
              )}
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[14px] font-medium">Autonomia</legend>
            {MODES.map((mode) => {
              const disabled =
                (mode.value === 'AUTO_RULES' && !status.autoExecution) ||
                (mode.value !== 'SUGGEST' && !status.assistedActions);
              return (
                <label
                  key={mode.value}
                  className={cn(
                    'flex min-h-11 items-start gap-3 rounded-xl px-3 py-2 ring-1',
                    stored === mode.value
                      ? 'bg-system-blue/10 ring-system-blue/40'
                      : 'ring-foreground/10',
                    disabled && 'opacity-55',
                  )}
                >
                  <input
                    type="radio"
                    name="ai-autonomy"
                    className="accent-system-blue mt-1 size-4"
                    checked={stored === mode.value}
                    disabled={disabled || setMode.isPending}
                    onChange={() => setMode.mutate(mode.value)}
                  />
                  <span className="flex flex-col text-[14px]">
                    <span className="font-medium">{AUTONOMY_LABEL[mode.value]}</span>
                    <span className="text-label-secondary text-[12px]">
                      {mode.description}
                      {mode.value === 'AUTO_RULES' &&
                        !status.autoExecution &&
                        ' Ainda não disponível.'}
                    </span>
                  </span>
                </label>
              );
            })}
            {stored !== effective && (
              <p className="text-label-secondary text-[12px]">
                Valendo agora: {AUTONOMY_LABEL[effective]} (o plano atual não permite o modo salvo;
                a configuração fica guardada, pausada).
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <h3 className="text-[14px] font-medium">Rotinas autorizadas</h3>
            {!settings || settings.authorizations.length === 0 ? (
              <p className="text-label-secondary text-[13px]">
                Nenhuma rotina automática disponível ainda. Quando houver, cada uma terá autorização
                própria, com escopo e limites. Alteração de preços, exclusões, estornos, alterações
                financeiras, mensagens em massa e fichas clínicas sempre pedem aprovação.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {settings.authorizations.map((auth) => (
                  <li key={auth.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {auth.label} ·{' '}
                      {auth.effectiveStatus === 'PAUSED_BY_PLAN'
                        ? 'pausada pelo plano'
                        : auth.effectiveStatus === 'ACTIVE'
                          ? 'ativa'
                          : 'pausada'}
                    </span>
                    <span className="flex gap-1">
                      {auth.status === 'ACTIVE' ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setAuth.mutate({ id: auth.id, status: 'PAUSED' })}
                        >
                          Pausar
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setAuth.mutate({ id: auth.id, status: 'ACTIVE' })}
                        >
                          Reativar
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setAuth.mutate({ id: auth.id, status: 'REVOKED' })}
                      >
                        Revogar
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {settings?.addOns.map((addOn) => (
            <div key={addOn.id} className="text-[13px]">
              <span className="font-medium">{addOn.name}</span>
              <span className="text-label-secondary">
                {' '}
                — em preparação; preço e limites a definir.
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
