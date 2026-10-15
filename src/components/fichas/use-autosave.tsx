'use client';

import * as React from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Salvamento automático de rascunho: agenda a gravação a cada mudança (com espera), mostra
 * "Salvando…/Salvo/Falha" e permite tentar de novo. `cancel` antes de enviar, para um rascunho
 * atrasado não chegar depois do envio.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 1200) {
  const [status, setStatus] = React.useState<AutosaveStatus>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef<{ value: T } | null>(null);
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const run = React.useCallback(async () => {
    timer.current = null;
    if (!latest.current) return;
    const { value } = latest.current;
    setStatus('saving');
    try {
      await saveRef.current(value);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);

  const schedule = React.useCallback(
    (value: T) => {
      latest.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, delay);
    },
    [delay, run],
  );

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = null;
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { status, schedule, cancel, retry: run };
}

export function AutosaveText({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  if (status === 'idle') return null;
  if (status === 'error') {
    return (
      <span className="text-system-red text-[12px]" role="status">
        Falha ao salvar o rascunho.{' '}
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={onRetry}
        >
          Tentar de novo
        </button>
      </span>
    );
  }
  return (
    <span className="text-label-secondary text-[12px]" role="status" aria-live="polite">
      {status === 'saving' ? 'Salvando…' : 'Rascunho salvo'}
    </span>
  );
}
