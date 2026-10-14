import { Reveal, SectionTitle } from '@/components/landing/reveal';

const STEPS = [
  {
    title: 'Crie sua conta',
    description:
      'Leva poucos minutos. Não precisa instalar nada: funciona no navegador do celular e do computador.',
  },
  {
    title: 'Cadastre equipe e serviços',
    description:
      'Profissionais, horários de trabalho e preços. Traga seus clientes de outro sistema por planilha.',
  },
  {
    title: 'Divulgue seu link',
    description:
      'Ligue o agendamento online e coloque o link no Instagram e no WhatsApp. Os horários começam a chegar.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 md:pb-32">
      <SectionTitle eyebrow="Como funciona" title="Comece a usar hoje mesmo." />
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.08}>
            <div className="bg-tile flex h-full flex-col gap-4 rounded-[24px] p-6 md:p-7">
              <span className="bg-system-blue flex size-9 items-center justify-center rounded-full text-[15px] font-bold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">{step.title}</h3>
                <p className="text-label-secondary mt-1.5 text-[15px] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
