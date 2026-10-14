import {
  EyeIcon,
  FlowerIcon,
  HandIcon,
  HeartPulseIcon,
  PawPrintIcon,
  PenToolIcon,
  ScissorsIcon,
  SparklesIcon,
} from 'lucide-react';

import { Reveal } from '@/components/landing/reveal';

const SEGMENTS = [
  { label: 'Barbearias', icon: ScissorsIcon },
  { label: 'Salões de beleza', icon: SparklesIcon },
  { label: 'Clínicas de estética', icon: FlowerIcon },
  { label: 'Manicure e pedicure', icon: HandIcon },
  { label: 'Lash e sobrancelhas', icon: EyeIcon },
  { label: 'Massoterapia', icon: HeartPulseIcon },
  { label: 'Estúdios de tatuagem', icon: PenToolIcon },
  { label: 'Banho e tosa', icon: PawPrintIcon },
];

/** Para o visitante se reconhecer logo depois da prévia. */
export function Segments() {
  return (
    <section className="px-5 pb-24 md:pb-32">
      <Reveal className="mx-auto max-w-5xl text-center">
        <p className="text-label-secondary text-[15px]">
          Feito para quem trabalha com hora marcada
        </p>
        <ul className="mt-5 flex flex-wrap justify-center gap-2 md:gap-2.5">
          {SEGMENTS.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="bg-tile flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium md:text-[15px]"
            >
              <Icon className="text-system-blue size-4" />
              {label}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
