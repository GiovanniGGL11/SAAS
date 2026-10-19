import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, onFocus, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      // Campo numérico já preenchido (ex.: 0): ao focar, seleciona tudo — digitar substitui o valor
      // em vez de obrigar a apagar o "0" antes.
      onFocus={(event) => {
        if (type === 'number') event.currentTarget.select();
        onFocus?.(event);
      }}
      className={cn(
        'bg-foreground/[0.05] hover:bg-foreground/[0.07] focus-visible:bg-background file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-10 w-full min-w-0 rounded-xl border border-transparent px-3.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
