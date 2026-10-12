import Link from 'next/link';
import { CheckCircle2Icon, CircleIcon } from 'lucide-react';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';

export type SetupStep = { label: string; hint: string; href: string; done: boolean };

/** Primeiros passos de uma conta nova: some sozinho quando tudo estiver feito. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <AppleTile interactive={false}>
      <div className="flex items-center justify-between">
        <TileEyebrow>Primeiros passos</TileEyebrow>
        <span className="text-label-secondary text-[12px] tabular-nums">
          {done} de {steps.length}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="hover:bg-foreground/[0.04] flex items-start gap-3 rounded-xl px-2 py-2"
            >
              {step.done ? (
                <CheckCircle2Icon className="text-system-green mt-0.5 size-5 shrink-0" />
              ) : (
                <CircleIcon className="text-label-secondary mt-0.5 size-5 shrink-0" />
              )}
              <span>
                <span className={step.done ? 'text-label-secondary line-through' : 'font-medium'}>
                  {step.label}
                </span>
                {!step.done && (
                  <span className="text-label-secondary block text-[13px]">{step.hint}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AppleTile>
  );
}
