import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export const BOOKING_STEPS = ['Serviço e profissional', 'Dia e horário', 'Seus dados'] as const;

/** Em que etapa a pessoa está: nomes no computador, "Etapa 2 de 3" compacto no celular. */
export function BookingProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Etapas do agendamento">
      {/* Celular */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-[13px] font-medium">
          <span className="text-label-secondary">Etapa {step} de 3 — </span>
          {BOOKING_STEPS[step - 1]}
        </p>
        <div className="flex gap-1" aria-hidden>
          {BOOKING_STEPS.map((label, index) => (
            <span
              key={label}
              className={cn(
                'h-1 flex-1 rounded-full',
                index < step ? 'bg-system-blue' : 'bg-foreground/[0.1]',
              )}
            />
          ))}
        </div>
      </div>

      {/* Computador */}
      <ol className="hidden items-center gap-3 md:flex">
        {BOOKING_STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const current = number === step;
          return (
            <li key={label} className="flex items-center gap-3">
              {index > 0 && <span className="bg-foreground/[0.12] h-px w-8" aria-hidden />}
              <span
                className="flex items-center gap-2 text-[14px]"
                aria-current={current ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-[12px] font-semibold',
                    current && 'bg-system-blue text-white',
                    done && 'bg-system-blue/12 text-system-blue',
                    !current && !done && 'bg-foreground/[0.07] text-label-secondary',
                  )}
                >
                  {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : number}
                </span>
                <span
                  className={cn(current ? 'text-foreground font-semibold' : 'text-label-secondary')}
                >
                  {label}
                  {done && <span className="sr-only"> (concluída)</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
