'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { formatCep, lookupCep } from '@/lib/address';
import { withNetworkRetry } from '@/lib/network-retry';
import type { SignupConfig, SignupFieldKey } from '@/lib/self-signup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { submitSelfSignupAction } from '@/server/actions/self-signup-actions';

type Values = Record<
  | 'name'
  | 'phone'
  | 'email'
  | 'birthDate'
  | 'cpf'
  | 'zipCode'
  | 'street'
  | 'number'
  | 'complement'
  | 'district'
  | 'city'
  | 'state'
  | 'notes'
  | 'website',
  string
>;

const EMPTY: Values = {
  name: '',
  phone: '',
  email: '',
  birthDate: '',
  cpf: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  notes: '',
  website: '',
};

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium">
        {label}
        {!required && <span className="text-label-secondary font-normal"> (opcional)</span>}
      </span>
      {children}
      {error && <span className="text-destructive text-[12px]">{error}</span>}
    </label>
  );
}

/** Formulário do cadastro pelo link. Mostra só os campos que o negócio pede. */
export function SelfSignupForm({
  slug,
  companyName,
  config,
}: {
  slug: string;
  companyName: string;
  config: SignupConfig;
}) {
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);
  const set =
    (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));
  const shown = (key: SignupFieldKey) => config[key] !== 'off';
  const required = (key: SignupFieldKey) => config[key] === 'required';

  const submit = useMutation({
    mutationFn: () =>
      withNetworkRetry(() => submitSelfSignupAction({ slug, ...values, marketingOptIn })).then(
        unwrapResult,
      ),
    onSuccess: (result) => {
      if (result.status === 'invalid') {
        setErrors(result.fields);
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e: Error) => setErrors({ form: e.message }),
  });

  async function fillFromCep(raw: string) {
    if (raw.replace(/\D/g, '').length !== 8) return;
    try {
      const found = await lookupCep(raw);
      if (found) {
        setValues((v) => ({
          ...v,
          street: v.street || found.street,
          district: v.district || found.district,
          city: v.city || found.city,
          state: v.state || found.state,
        }));
      }
    } catch {
      // Sem internet ou ViaCEP fora do ar: a pessoa digita.
    }
  }

  if (done) {
    return (
      <section className="bg-background flex flex-col items-center gap-3 rounded-[24px] p-8 text-center shadow-[0_18px_40px_-28px_rgb(0_0_0/0.35)]">
        <CheckCircle2Icon className="text-system-green size-12" />
        <h2 className="text-[22px] font-semibold">Cadastro feito!</h2>
        <p className="text-label-secondary text-[15px]">
          Obrigado, {values.name.trim().split(' ')[0]}. {companyName} já tem os seus dados.
        </p>
      </section>
    );
  }

  return (
    <form
      noValidate
      className="bg-background flex flex-col gap-4 rounded-[24px] p-5 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.35)] sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        submit.mutate();
      }}
    >
      <Field label="Nome completo" required error={errors.name}>
        <Input autoComplete="name" value={values.name} onChange={set('name')} />
      </Field>
      <Field label="WhatsApp" required error={errors.phone}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98888-7777"
          value={values.phone}
          onChange={set('phone')}
        />
      </Field>
      {shown('email') && (
        <Field label="E-mail" required={required('email')} error={errors.email}>
          <Input type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {shown('birthDate') && (
          <Field
            label="Data de nascimento"
            required={required('birthDate')}
            error={errors.birthDate}
          >
            <Input
              type="date"
              autoComplete="bday"
              value={values.birthDate}
              onChange={set('birthDate')}
            />
          </Field>
        )}
        {shown('cpf') && (
          <Field label="CPF" required={required('cpf')} error={errors.cpf}>
            <Input
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={values.cpf}
              onChange={set('cpf')}
            />
          </Field>
        )}
      </div>
      {shown('address') && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-[13px] font-medium">
            Endereço
            {!required('address') && (
              <span className="text-label-secondary font-normal"> (opcional)</span>
            )}
          </legend>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="CEP"
              aria-label="CEP"
              value={formatCep(values.zipCode)}
              onChange={(e) => {
                setValues((v) => ({ ...v, zipCode: e.target.value }));
                fillFromCep(e.target.value);
              }}
            />
            <Input
              placeholder="Rua"
              aria-label="Rua"
              value={values.street}
              onChange={set('street')}
            />
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Input
              placeholder="Número"
              aria-label="Número"
              value={values.number}
              onChange={set('number')}
            />
            <Input
              placeholder="Complemento"
              aria-label="Complemento"
              value={values.complement}
              onChange={set('complement')}
            />
          </div>
          <div className="grid grid-cols-[2fr_2fr_1fr] gap-3">
            <Input
              placeholder="Bairro"
              aria-label="Bairro"
              value={values.district}
              onChange={set('district')}
            />
            <Input
              placeholder="Cidade"
              aria-label="Cidade"
              value={values.city}
              onChange={set('city')}
            />
            <Input
              placeholder="UF"
              aria-label="UF"
              maxLength={2}
              value={values.state}
              onChange={set('state')}
            />
          </div>
          {errors.address && <span className="text-destructive text-[12px]">{errors.address}</span>}
        </fieldset>
      )}
      {shown('notes') && (
        <Field
          label="Observações (alergias, preferências...)"
          required={required('notes')}
          error={errors.notes}
        >
          <Textarea rows={3} value={values.notes} onChange={set('notes')} />
        </Field>
      )}
      {/* Armadilha para robôs: invisível para pessoas. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        value={values.website}
        onChange={set('website')}
      />
      <label className="flex items-start gap-2.5 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={marketingOptIn}
          onChange={(e) => setMarketingOptIn(e.target.checked)}
        />
        <span>Quero receber novidades e promoções de {companyName} pelo WhatsApp.</span>
      </label>
      {errors.form && <p className="text-destructive text-[13px]">{errors.form}</p>}
      <Button type="submit" size="lg" disabled={submit.isPending} className="mt-1">
        {submit.isPending ? 'Enviando...' : 'Fazer cadastro'}
      </Button>
      <p className="text-label-secondary text-center text-[11px] leading-snug">
        Seus dados ficam só com {companyName}, para o atendimento. Lembretes e confirmações de
        horário continuam chegando mesmo sem marcar promoções.
      </p>
    </form>
  );
}
