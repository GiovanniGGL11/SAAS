'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { formatCep, lookupCep } from '@/lib/address';
import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateCompanyPublicProfileAction } from '@/server/actions/company-actions';

export type PublicProfile = {
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  instagram: string | null;
  cancellationPolicy: string | null;
};

const SUGGESTED_POLICY =
  'Cancelamentos e remarcações com pelo menos 2 horas de antecedência, pelo link de confirmação ou pelo WhatsApp. Atrasos acima de 15 minutos podem reduzir o tempo do atendimento ou exigir remarcação.';

type Field = keyof PublicProfile;

/** O que aparece na página pública de agendamento: endereço, Instagram e política de cancelamento. */
export function PublicProfileCard({
  initial,
  hasLogo,
}: {
  initial: PublicProfile;
  hasLogo: boolean;
}) {
  const [form, setForm] = React.useState<Record<Field, string>>(() => ({
    zipCode: formatCep(initial.zipCode),
    street: initial.street ?? '',
    number: initial.number ?? '',
    complement: initial.complement ?? '',
    district: initial.district ?? '',
    city: initial.city ?? '',
    state: initial.state ?? '',
    instagram: initial.instagram ? `@${initial.instagram}` : '',
    cancellationPolicy: initial.cancellationPolicy ?? '',
  }));
  const [cepState, setCepState] = React.useState<'idle' | 'loading' | 'notFound' | 'error'>('idle');
  const lookup = React.useRef<AbortController | null>(null);

  const set = (field: Field, value: string) => setForm((f) => ({ ...f, [field]: value }));

  function onCepChange(value: string) {
    const masked = formatCep(value);
    set('zipCode', masked);
    const digits = masked.replace(/\D/g, '');
    lookup.current?.abort();
    if (digits.length !== 8) {
      setCepState('idle');
      return;
    }
    const controller = new AbortController();
    lookup.current = controller;
    setCepState('loading');
    lookupCep(digits, controller.signal)
      .then((address) => {
        if (controller.signal.aborted) return;
        if (!address) return setCepState('notFound');
        setCepState('idle');
        // Preenche só o que a pessoa ainda não digitou.
        setForm((f) => ({
          ...f,
          street: f.street || address.street,
          district: f.district || address.district,
          city: f.city || address.city,
          state: f.state || address.state,
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCepState('error');
      });
  }

  const save = useMutation({
    mutationFn: () => updateCompanyPublicProfileAction(form).then(unwrapResult),
    onSuccess: () => toast.success('Página de agendamento atualizada.'),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  const field = (name: Field, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`profile-${name}`} className="text-[13px]">
        {label}
      </Label>
      <Input
        id={`profile-${name}`}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        {...props}
      />
    </div>
  );

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Página de agendamento</h2>
        <p className="text-label-secondary text-[13px]">
          O que seus clientes veem no link público, além dos horários.{' '}
          {hasLogo
            ? 'A logo é a foto da organização (em Organização e membros, abaixo).'
            : 'Para mostrar sua logo, envie a foto da organização em Organização e membros, abaixo.'}
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <legend className="text-label-secondary mb-2 text-[12px] font-semibold uppercase">
            Endereço
          </legend>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="profile-zipCode" className="text-[13px]">
              CEP
            </Label>
            <div className="relative">
              <Input
                id="profile-zipCode"
                inputMode="numeric"
                placeholder="00000-000"
                value={form.zipCode}
                onChange={(e) => onCepChange(e.target.value)}
              />
              {cepState === 'loading' && (
                <Loader2Icon className="text-label-secondary absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
              )}
            </div>
            {cepState === 'notFound' && (
              <span className="text-destructive text-[12px]">CEP não encontrado.</span>
            )}
            {cepState === 'error' && (
              <span className="text-destructive text-[12px]">
                Não deu para consultar o CEP. Preencha à mão.
              </span>
            )}
          </div>
          <div className="col-span-2 sm:col-span-4">{field('street', 'Rua')}</div>
          <div className="col-span-1 sm:col-span-2">
            {field('number', 'Número', { inputMode: 'numeric' })}
          </div>
          <div className="col-span-1 sm:col-span-4">{field('complement', 'Complemento')}</div>
          <div className="col-span-2 sm:col-span-3">{field('district', 'Bairro')}</div>
          <div className="col-span-1 sm:col-span-2">{field('city', 'Cidade')}</div>
          <div className="col-span-1">{field('state', 'UF', { maxLength: 2 })}</div>
        </fieldset>

        {field('instagram', 'Instagram', { placeholder: '@suaempresa' })}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="profile-policy" className="text-[13px]">
              Política de cancelamento
            </Label>
            {!form.cancellationPolicy && (
              <button
                type="button"
                className="text-system-blue text-[12px] font-medium"
                onClick={() => set('cancellationPolicy', SUGGESTED_POLICY)}
              >
                Usar sugestão
              </button>
            )}
          </div>
          <Textarea
            id="profile-policy"
            rows={3}
            maxLength={1000}
            placeholder="Ex.: cancelamentos com pelo menos 2 horas de antecedência."
            value={form.cancellationPolicy}
            onChange={(e) => set('cancellationPolicy', e.target.value)}
          />
          <span className="text-label-secondary text-[12px]">
            Aparece antes de o cliente confirmar a reserva.
          </span>
        </div>

        <Button type="submit" className="self-start" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar página de agendamento'}
        </Button>
      </form>
    </section>
  );
}
