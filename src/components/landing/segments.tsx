import {
  ActivityIcon,
  BrainIcon,
  CameraIcon,
  CarIcon,
  DumbbellIcon,
  EyeIcon,
  FlowerIcon,
  GraduationCapIcon,
  HandIcon,
  HeartPulseIcon,
  LeafIcon,
  MusicIcon,
  PawPrintIcon,
  PenToolIcon,
  ScaleIcon,
  ScissorsIcon,
  SmileIcon,
  SparklesIcon,
  StethoscopeIcon,
  type LucideIcon,
} from 'lucide-react';

import { Reveal } from '@/components/landing/reveal';

type Segment = { label: string; icon: LucideIcon };

/** Quem usa, por área. O sistema é o mesmo: hora marcada, cobrança, caixa e ficha do cliente. */
const GROUPS: { title: string; items: Segment[] }[] = [
  {
    title: 'Beleza e estética',
    items: [
      { label: 'Barbearias', icon: ScissorsIcon },
      { label: 'Salões de beleza', icon: SparklesIcon },
      { label: 'Clínicas de estética', icon: FlowerIcon },
      { label: 'Manicure e pedicure', icon: HandIcon },
      { label: 'Lash e sobrancelhas', icon: EyeIcon },
      { label: 'Estúdios de tatuagem e piercing', icon: PenToolIcon },
      { label: 'Depilação e bronzeamento', icon: SparklesIcon },
    ],
  },
  {
    title: 'Saúde e bem-estar',
    items: [
      { label: 'Consultórios e clínicas', icon: StethoscopeIcon },
      { label: 'Odontologia', icon: SmileIcon },
      { label: 'Psicologia e terapias', icon: BrainIcon },
      { label: 'Nutrição', icon: LeafIcon },
      { label: 'Fisioterapia e pilates', icon: ActivityIcon },
      { label: 'Massoterapia e spa', icon: HeartPulseIcon },
      { label: 'Personal trainers e estúdios', icon: DumbbellIcon },
    ],
  },
  {
    title: 'Pets',
    items: [
      { label: 'Banho e tosa', icon: PawPrintIcon },
      { label: 'Veterinárias', icon: StethoscopeIcon },
    ],
  },
  {
    title: 'Aulas, serviços e consultoria',
    items: [
      { label: 'Aulas particulares e idiomas', icon: GraduationCapIcon },
      { label: 'Música e artes', icon: MusicIcon },
      { label: 'Fotografia e estúdios', icon: CameraIcon },
      { label: 'Advogados e contadores', icon: ScaleIcon },
      { label: 'Estética automotiva e oficinas', icon: CarIcon },
    ],
  },
];

/** Para o visitante se reconhecer logo depois da prévia. */
export function Segments() {
  return (
    <section className="px-5 pb-24 md:pb-32">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-balance md:text-[28px]">
          Feito para quem trabalha com hora marcada
        </h2>
        <p className="text-label-secondary mx-auto mt-2 max-w-xl text-[15px] text-balance">
          Se o seu cliente agenda, atende e paga, o Atendafy organiza. Não achou o seu ramo? Ele
          funciona do mesmo jeito.
        </p>
        <div className="mt-8 grid gap-6 text-left md:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-label-secondary mb-2.5 text-[13px] font-medium tracking-wide uppercase">
                {group.title}
              </h3>
              <ul className="flex flex-wrap gap-2 md:gap-2.5">
                {group.items.map(({ label, icon: Icon }) => (
                  <li
                    key={label}
                    className="bg-tile flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium md:text-[15px]"
                  >
                    <Icon className="text-system-blue size-4 shrink-0" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
