'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';

import { type Answers, type FormSchema, validateAnswers } from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import { FormRenderer, answeredProgress } from '@/components/fichas/form-renderer';
import { AutosaveText, useAutosave } from '@/components/fichas/use-autosave';
import {
  savePublicFormDraftAction,
  submitPublicFormAction,
} from '@/server/actions/public-form-actions';

/**
 * Ficha pelo link: uma coluna, campos confortáveis no celular, rascunho salvo sozinho e
 * confirmação só depois que o servidor aceitou o envio.
 */
export function PublicForm({
  token,
  companyName,
  logoUrl,
  privacyNotice,
  clientFirstName,
  formName,
  instructions,
  schema,
  initialAnswers,
  expiresAt,
}: {
  token: string;
  companyName: string;
  logoUrl: string | null;
  privacyNotice: string | null;
  clientFirstName: string;
  formName: string;
  instructions: string | null;
  schema: FormSchema;
  initialAnswers: Answers;
  expiresAt: string;
}) {
  const [answers, setAnswers] = React.useState<Answers>(initialAnswers);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [sent, setSent] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const autosave = useAutosave(async (value: Answers) => {
    const result = await savePublicFormDraftAction({ token, answers: value });
    if (!result.ok) throw new Error(result.error);
  }, 1500);

  const submit = useMutation({
    mutationFn: async () => {
      const result = await submitPublicFormAction({ token, answers });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      if (result.ok) {
        setSent(true);
        window.scrollTo({ top: 0 });
        return;
      }
      setErrors(result.errors);
      setFormError(result.message);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const { answered, total } = answeredProgress(schema, answers);
  const long = total > 8;

  if (sent) {
    return (
      <main className="font-apple bg-tile flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <CheckCircle2Icon className="text-system-green size-12" />
        <h1 className="text-[22px] font-semibold">Ficha enviada</h1>
        <p className="text-label-secondary max-w-sm text-[15px]">
          Obrigado, {clientFirstName}! {companyName} já recebeu suas respostas. Você pode fechar
          esta página.
        </p>
      </main>
    );
  }

  return (
    <main className="font-apple bg-tile flex min-h-dvh flex-1 flex-col items-center px-4 py-6 sm:py-10">
      <div className="flex w-full max-w-xl flex-col gap-5">
        <header className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo externa do Clerk
            <img src={logoUrl} alt="" className="size-11 rounded-xl object-cover" />
          )}
          <div className="min-w-0">
            <div className="text-label-secondary truncate text-[13px]">{companyName}</div>
            <h1 className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{formName}</h1>
          </div>
        </header>

        <div className="bg-background flex flex-col gap-3 rounded-[22px] p-5 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
          <p className="text-[15px]">Olá, {clientFirstName}!</p>
          {instructions && (
            <p className="text-label-secondary text-[14px] whitespace-pre-wrap">{instructions}</p>
          )}
          {privacyNotice && (
            <details className="text-[13px]">
              <summary className="text-system-blue cursor-pointer">
                Aviso de privacidade de {companyName}
              </summary>
              <p className="text-label-secondary mt-2 whitespace-pre-wrap">{privacyNotice}</p>
            </details>
          )}
          <p className="text-label-secondary text-[12px]">
            Perguntas com * são obrigatórias. Suas respostas são salvas como rascunho enquanto você
            preenche. Link válido até{' '}
            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
              new Date(expiresAt),
            )}
            .
          </p>
        </div>

        {long && (
          <div className="flex flex-col gap-1" aria-live="polite">
            <div className="text-label-secondary flex justify-between text-[12px]">
              <span>Progresso</span>
              <span>
                {answered} de {total} respondidas
              </span>
            </div>
            <div
              className="bg-foreground/[0.08] h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answered}
              aria-label="Perguntas respondidas"
            >
              <div
                className="bg-system-blue h-full rounded-full"
                style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <form
          className="bg-background flex flex-col gap-6 rounded-[22px] p-5 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setFormError(null);
            const result = validateAnswers(schema, answers, { mode: 'submit', audience: 'client' });
            setErrors(result.errors);
            if (Object.keys(result.errors).length) {
              setFormError('Confira as perguntas destacadas.');
              document.getElementById(`c-${Object.keys(result.errors)[0]}`)?.focus();
              return;
            }
            autosave.cancel();
            submit.mutate();
          }}
        >
          <FormRenderer
            schema={schema}
            answers={answers}
            errors={errors}
            idPrefix="c"
            onChange={(id, value) => {
              const next = { ...answers, [id]: value };
              setAnswers(next);
              if (errors[id])
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next[id];
                  return next;
                });
              autosave.schedule(next);
            }}
          />
          {formError && (
            <p role="alert" className="text-system-red text-[14px]">
              {formError}
            </p>
          )}
          {/* No fim do formulário, não fixo na tela: o teclado do celular não cobre o botão. */}
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" className="w-full" disabled={submit.isPending}>
              {submit.isPending ? 'Enviando…' : 'Enviar ficha'}
            </Button>
            <div className="text-center">
              <AutosaveText status={autosave.status} onRetry={autosave.retry} />
            </div>
          </div>
        </form>
        <p className="text-label-secondary text-center text-[11px]">
          Este link serve só para esta ficha. Não compartilhe.
        </p>
      </div>
    </main>
  );
}
