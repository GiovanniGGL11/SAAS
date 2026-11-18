'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { lookupCep } from '@/lib/address';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  SignaturePad,
  hasInk,
  strokesToPng,
  type Stroke,
} from '@/components/pacotes/signature-pad';
import {
  type Answers,
  type FormSchema,
  type Question,
  answerText,
  isQuestionVisible,
  optionsOf,
} from '@/lib/forms/schema';

/**
 * Mostra as seções e perguntas de uma ficha — para preencher (equipe ou cliente), para a prévia
 * do editor e para leitura. Pergunta escondida pela condição some (e não bloqueia o envio).
 */
export function FormRenderer({
  schema,
  answers,
  onChange,
  errors = {},
  readOnly = false,
  copiedIds,
  idPrefix = 'f',
}: {
  schema: FormSchema;
  answers: Answers;
  onChange?: (id: string, value: unknown) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  /** Respostas copiadas da ficha anterior (marcadas para conferência). */
  copiedIds?: Set<string>;
  idPrefix?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {schema.sections.map((section) => {
        const visible = section.questions.filter((q) => isQuestionVisible(schema, q, answers));
        if (visible.length === 0) return null;
        return (
          <section
            key={section.id}
            className="flex flex-col gap-4"
            aria-labelledby={`${idPrefix}-${section.id}`}
          >
            <div>
              <h3
                id={`${idPrefix}-${section.id}`}
                className="text-[16px] font-semibold tracking-[-0.01em]"
              >
                {section.title}
              </h3>
              {section.description && (
                <p className="text-label-secondary mt-0.5 text-[13px]">{section.description}</p>
              )}
              {section.audience === 'staff' && (
                <p className="text-label-secondary mt-0.5 text-[12px]">
                  Seção da equipe — não aparece para o cliente.
                </p>
              )}
            </div>
            {visible.map((question) => (
              <QuestionField
                key={question.id}
                idPrefix={idPrefix}
                question={question}
                value={answers[question.id]}
                error={errors[question.id]}
                readOnly={readOnly}
                copied={copiedIds?.has(question.id) ?? false}
                onChange={(value) => onChange?.(question.id, value)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function QuestionField({
  question,
  value,
  error,
  readOnly,
  copied,
  onChange,
  idPrefix,
}: {
  question: Question;
  value: unknown;
  error?: string;
  readOnly: boolean;
  copied: boolean;
  onChange: (value: unknown) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${question.id}`;
  const describedBy =
    [question.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined;
  const label = (
    <>
      {question.title}
      {question.required && (
        <span className="text-system-red ml-0.5" aria-hidden>
          *
        </span>
      )}
      {question.required && <span className="sr-only"> (obrigatória)</span>}
    </>
  );
  const isGroup =
    question.type === 'yes_no' ||
    question.type === 'single_choice' ||
    question.type === 'multi_choice';

  if (readOnly) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-label-secondary text-[13px]">{question.title}</div>
        {question.type === 'signature' && typeof value === 'string' && value ? (
          // eslint-disable-next-line @next/next/no-img-element -- assinatura guardada como data URL
          <img
            src={value}
            alt="Assinatura"
            className="h-24 w-auto max-w-full self-start rounded-xl bg-white p-1"
          />
        ) : (
          <div className="text-[15px] break-words whitespace-pre-wrap">
            {answerText(question, value)}
          </div>
        )}
      </div>
    );
  }

  const field = (() => {
    switch (question.type) {
      case 'short_text':
        return (
          <Input
            id={id}
            className="h-11 text-[16px] md:h-9 md:text-sm"
            value={typeof value === 'string' ? value : ''}
            maxLength={500}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'long_text':
        return (
          <Textarea
            id={id}
            rows={3}
            className="text-[16px] md:text-sm"
            value={typeof value === 'string' ? value : ''}
            maxLength={5000}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'date':
        return (
          <Input
            id={id}
            type="date"
            className="h-11 w-full text-[16px] sm:w-56 md:h-9 md:text-sm"
            value={typeof value === 'string' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'number':
        return (
          <Input
            id={id}
            inputMode="decimal"
            className="h-11 w-full text-[16px] sm:w-56 md:h-9 md:text-sm"
            value={value === undefined || value === null ? '' : String(value)}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ''))}
          />
        );
      case 'cep':
        return (
          <CepField
            id={id}
            value={typeof value === 'string' ? value : ''}
            invalid={!!error}
            describedBy={describedBy}
            onChange={onChange}
          />
        );
      case 'signature':
        return <SignatureField value={value} onChange={onChange} />;
      case 'multi_choice': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-col gap-1.5">
            {optionsOf(question).map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px] ring-1 transition-colors md:min-h-9',
                    checked
                      ? 'bg-system-blue/10 ring-system-blue/40'
                      : 'ring-foreground/10 hover:bg-foreground/[0.03]',
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-system-blue size-4"
                    checked={checked}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, option.id]
                          : selected.filter((v) => v !== option.id),
                      )
                    }
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        );
      }
      default: {
        // Sim/não e escolha única: botões de rádio nativos (teclado e leitor de tela funcionam).
        const options = optionsOf(question);
        const inline = question.type === 'yes_no';
        return (
          <div className={cn('flex gap-1.5', inline ? 'flex-row flex-wrap' : 'flex-col')}>
            {options.map((option) => {
              const checked = value === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px] ring-1 transition-colors md:min-h-9',
                    inline && 'min-w-24',
                    checked
                      ? 'bg-system-blue/10 ring-system-blue/40'
                      : 'ring-foreground/10 hover:bg-foreground/[0.03]',
                  )}
                >
                  <input
                    type="radio"
                    name={id}
                    className="accent-system-blue size-4"
                    checked={checked}
                    onChange={() => onChange(option.id)}
                  />
                  {option.label}
                </label>
              );
            })}
            {typeof value === 'string' && value !== '' && !question.required && (
              <button
                type="button"
                className="text-label-secondary self-start text-[12px] underline-offset-2 hover:underline"
                onClick={() => onChange(undefined)}
              >
                Limpar resposta
              </button>
            )}
          </div>
        );
      }
    }
  })();

  const Wrapper = isGroup ? 'fieldset' : 'div';
  return (
    <Wrapper
      className={cn(
        'flex min-w-0 flex-col gap-1.5',
        copied && 'rounded-xl bg-amber-500/[0.07] p-2 ring-1 ring-amber-500/30',
      )}
      aria-describedby={isGroup ? describedBy : undefined}
      aria-invalid={isGroup && error ? true : undefined}
    >
      {isGroup ? (
        <legend className="mb-1.5 text-[14px] font-medium">{label}</legend>
      ) : (
        <label htmlFor={id} className="text-[14px] font-medium">
          {label}
        </label>
      )}
      {copied && (
        <span className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
          Copiada da ficha anterior — confira antes de enviar
        </span>
      )}
      {question.help && (
        <p id={`${id}-help`} className="text-label-secondary -mt-1 text-[12px]">
          {question.help}
        </p>
      )}
      {field}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-system-red text-[12px]">
          {error}
        </p>
      )}
    </Wrapper>
  );
}

/** Quantas perguntas visíveis já têm resposta (para o progresso em formulários longos). */
export function answeredProgress(schema: FormSchema, answers: Answers) {
  const visible = schema.sections
    .flatMap((s) => s.questions)
    .filter((q) => isQuestionVisible(schema, q, answers));
  const answered = visible.filter((q) => {
    const v = answers[q.id];
    return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
  });
  return { answered: answered.length, total: visible.length };
}

/** Pergunta "Assinatura": o cliente assina com o dedo, a caneta ou o mouse. */
function SignatureField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [strokes, setStrokes] = React.useState<Stroke[]>([]);
  const signed = typeof value === 'string' && value.length > 0;
  if (signed && strokes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- assinatura guardada como data URL */}
        <img
          src={value as string}
          alt="Sua assinatura"
          className="h-24 w-auto max-w-full rounded-xl bg-white p-1 ring-1 ring-black/10"
        />
        <button
          type="button"
          className="text-system-blue text-[13px] font-medium"
          onClick={() => onChange(undefined)}
        >
          Assinar de novo
        </button>
      </div>
    );
  }
  return (
    <SignaturePad
      strokes={strokes}
      onChange={(next) => {
        setStrokes(next);
        onChange(hasInk(next) ? strokesToPng(next) : undefined);
      }}
      label="Assine aqui"
    />
  );
}

/**
 * Pergunta de CEP: aceita só números, formata 00000-000 e, com os 8 dígitos, consulta o endereço
 * (ViaCEP). Achou: a resposta guarda o CEP e o endereço. Não existe: fica só com os números e a
 * ficha não deixa enviar ("CEP inválido ou não encontrado"). Consulta fora do ar: guarda o CEP
 * formatado, para não travar quem está preenchendo.
 */
function CepField({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const digitsOf = (v: string) => v.replace(/\D/g, '').slice(0, 8);
  const [typed, setTyped] = React.useState(() => digitsOf(value.split(' · ')[0] ?? ''));
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'found' | 'missing' | 'offline'>(
    () => (value.includes(' · ') ? 'found' : 'idle'),
  );
  const address = value.includes(' · ') ? value.split(' · ').slice(1).join(' · ') : '';
  const masked = typed.length > 5 ? `${typed.slice(0, 5)}-${typed.slice(5)}` : typed;
  const request = React.useRef(0);

  const change = async (raw: string) => {
    const digits = digitsOf(raw);
    setTyped(digits);
    if (digits.length < 8) {
      setStatus('idle');
      onChange(digits);
      return;
    }
    const cep = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    const mine = ++request.current;
    setStatus('loading');
    try {
      const found = await lookupCep(digits);
      if (mine !== request.current) return;
      if (!found) {
        setStatus('missing');
        // Só os números: a validação recusa (CEP que não existe).
        onChange(digits);
        return;
      }
      const parts = [
        found.street,
        found.district,
        [found.city, found.state].filter(Boolean).join('/'),
      ].filter(Boolean);
      setStatus('found');
      onChange(parts.length ? `${cep} · ${parts.join(', ')}` : cep);
    } catch {
      if (mine !== request.current) return;
      setStatus('offline');
      onChange(cep);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        className="h-11 w-full text-[16px] sm:w-56 md:h-9 md:text-sm"
        value={masked}
        maxLength={9}
        aria-invalid={invalid || status === 'missing'}
        aria-describedby={describedBy}
        onChange={(e) => void change(e.target.value)}
      />
      {status === 'loading' && (
        <span className="text-label-secondary text-[12px]">Buscando o endereço…</span>
      )}
      {status === 'found' && address && <span className="text-[13px]">{address}</span>}
      {status === 'missing' && (
        <span className="text-system-red text-[12px]">CEP não encontrado. Confira os números.</span>
      )}
      {status === 'offline' && (
        <span className="text-label-secondary text-[12px]">
          Não deu para buscar o endereço agora; o CEP foi guardado.
        </span>
      )}
    </div>
  );
}
