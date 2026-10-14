import { CheckIcon, CheckCheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Reveal, SectionTitle } from '@/components/landing/reveal';

/*
  Os diferenciais, um por bloco, alternando texto e ilustração. As ilustrações são HTML com dados
  de exemplo (leves, nítidas em qualquer tela e no modo escuro).
*/

type Highlight = {
  eyebrow: string;
  title: string;
  bullets: string[];
  visual: React.ReactNode;
};

const HIGHLIGHTS: Highlight[] = [
  {
    eyebrow: 'Agendamento online',
    title: 'Seus clientes marcam sozinhos, 24 horas por dia.',
    bullets: [
      'Um link para a bio do Instagram e o WhatsApp',
      'Só aparecem horários livres, dentro do expediente de cada profissional',
      'Dois clientes nunca ficam com o mesmo horário',
    ],
    visual: <BookingVisual />,
  },
  {
    eyebrow: 'Confirmação pelo WhatsApp',
    title: 'Menos faltas, sem ficar ligando para ninguém.',
    bullets: [
      'Mensagem pronta com um clique, já com o link de confirmação',
      'O cliente confirma ou cancela sozinho, e a agenda se atualiza',
      'Lista de lembretes da véspera para não esquecer ninguém',
    ],
    visual: <WhatsappVisual />,
  },
  {
    eyebrow: 'Comanda e caixa',
    title: 'Cobre na hora e feche o caixa sem planilha.',
    bullets: [
      'Desconto, cupom, gorjeta e pagamento dividido (PIX + cartão)',
      'Caixa do dia com sangria, suprimento e conferência da gaveta',
      'Comissão de cada profissional calculada no relatório',
    ],
    visual: <CheckoutVisual />,
  },
  {
    eyebrow: 'Financeiro',
    title: 'Saiba quanto sobrou no fim do mês.',
    bullets: [
      'Taxas da maquininha descontadas e a data em que o dinheiro cai',
      'Contas fixas lembradas todo mês',
      'Resultado do mês (DRE) e planilha pronta para o contador',
    ],
    visual: <StatementVisual />,
  },
];

export function Highlights() {
  return (
    <section id="diferenciais" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 md:pb-32">
      <SectionTitle
        eyebrow="Do agendamento ao lucro"
        title="O dia inteiro do seu negócio num lugar só."
      />
      <div className="flex flex-col gap-16 md:gap-24">
        {HIGHLIGHTS.map((h, i) => (
          <div key={h.eyebrow} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
            <Reveal className={cn(i % 2 === 1 && 'md:order-2')}>
              <p className="text-system-blue text-[15px] font-semibold">{h.eyebrow}</p>
              <h3 className="mt-2 text-[28px] leading-[1.12] font-bold tracking-[-0.03em] text-balance md:text-[36px]">
                {h.title}
              </h3>
              <ul className="mt-6 flex flex-col gap-3">
                {h.bullets.map((b) => (
                  <li key={b} className="flex gap-3 text-[16px] leading-relaxed md:text-[17px]">
                    <span className="bg-system-green/15 text-system-green mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                      <CheckIcon className="size-3.5" />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1} className={cn(i % 2 === 1 && 'md:order-1')}>
              <div className="bg-tile relative isolate flex min-h-[340px] items-center justify-center overflow-hidden rounded-[32px] p-6 md:min-h-[420px] md:p-10">
                <div
                  aria-hidden
                  className="bg-system-blue/15 pointer-events-none absolute -top-20 -right-20 -z-10 size-72 rounded-full blur-[80px]"
                />
                {h.visual}
              </div>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'bg-background ring-foreground/[0.08] w-full rounded-[22px] shadow-[0_24px_60px_-24px_rgb(0_0_0/0.3)] ring-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

function BookingVisual() {
  const slots = ['09:00', '09:30', '10:00', '10:45', '11:15', '14:00', '14:30', '15:15', '16:00'];
  return (
    <Card className="max-w-[300px] p-5">
      <p className="text-label-secondary text-[12px]">Agendamento online</p>
      <p className="text-[19px] font-bold tracking-tight">Studio Bella</p>
      <div className="bg-foreground/[0.04] mt-4 rounded-xl px-3 py-2 text-[13px]">
        <span className="font-semibold">Corte feminino</span>
        <span className="text-label-secondary"> · 1h · R$ 90</span>
      </div>
      <div className="mt-4 flex gap-1.5">
        {[
          ['Seg', '13'],
          ['Ter', '14'],
          ['Qua', '15'],
          ['Qui', '16'],
        ].map(([d, n], i) => (
          <div
            key={d}
            className={cn(
              'flex flex-1 flex-col items-center rounded-xl py-1.5 text-[11px]',
              i === 1 ? 'bg-system-blue text-white' : 'bg-foreground/[0.05]',
            )}
          >
            {d}
            <span className="text-[15px] font-semibold">{n}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {slots.map((s) => (
          <div
            key={s}
            className={cn(
              'rounded-lg py-1.5 text-center text-[12px] font-medium tabular-nums',
              s === '10:45' ? 'bg-system-blue text-white' : 'bg-foreground/[0.05]',
            )}
          >
            {s}
          </div>
        ))}
      </div>
      <div className="bg-system-blue mt-4 rounded-full py-2 text-center text-[13px] font-semibold text-white">
        Confirmar horário
      </div>
    </Card>
  );
}

function WhatsappVisual() {
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <Card className="rounded-[18px] rounded-tl-md p-3.5 text-[13px] leading-relaxed">
        Olá, Paula! Seu horário: <strong>Corte feminino</strong>, amanhã às <strong>10:45</strong>.
        Confirme ou cancele por aqui:{' '}
        <span className="text-system-blue whitespace-nowrap">atendafy.com/confirmar/…</span>
        <div className="text-label-secondary mt-1 flex items-center justify-end gap-1 text-[10px]">
          18:02 <CheckCheckIcon className="text-system-blue size-3.5" />
        </div>
      </Card>
      <Card className="ml-auto max-w-[240px] p-4">
        <p className="text-label-secondary text-[12px]">Studio Bella</p>
        <p className="text-[15px] font-semibold">Quarta, 15 de outubro às 10:45</p>
        <div className="bg-system-green/15 text-system-green mt-3 flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold">
          <CheckIcon className="size-4" />
          Presença confirmada
        </div>
      </Card>
    </div>
  );
}

function CheckoutVisual() {
  const lines: [string, string, string?][] = [
    ['Corte + barba', 'R$ 80,00'],
    ['Cupom VOLTA10', '− R$ 8,00', 'text-system-green'],
    ['Gorjeta', '+ R$ 10,00'],
  ];
  return (
    <Card className="max-w-[320px] p-5">
      <p className="text-[15px] font-semibold">Concluir e cobrar</p>
      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {lines.map(([label, value, color]) => (
          <div key={label} className="flex justify-between">
            <span className="text-label-secondary">{label}</span>
            <span className={cn('tabular-nums', color)}>{value}</span>
          </div>
        ))}
      </div>
      <div className="border-foreground/[0.08] mt-3 flex flex-col gap-1.5 border-t pt-3 text-[13px]">
        <div className="flex justify-between">
          <span>PIX</span>
          <span className="tabular-nums">R$ 50,00</span>
        </div>
        <div className="flex justify-between">
          <span>Cartão de crédito</span>
          <span className="tabular-nums">R$ 32,00</span>
        </div>
      </div>
      <div className="bg-system-green mt-4 rounded-full py-2 text-center text-[13px] font-semibold text-white">
        Cobrar R$ 82,00
      </div>
      <div className="bg-foreground/[0.04] mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 text-[12px]">
        <span className="text-label-secondary">Esperado na gaveta</span>
        <span className="font-semibold tabular-nums">R$ 412,00</span>
      </div>
    </Card>
  );
}

function StatementVisual() {
  const rows: [string, string, boolean?][] = [
    ['Receita bruta', 'R$ 18.420,00', true],
    ['(−) Taxas de cartão', '− R$ 386,40'],
    ['Aluguel', '− R$ 2.500,00'],
    ['Comissões', '− R$ 5.890,00'],
    ['Produtos e insumos', '− R$ 1.240,00'],
  ];
  return (
    <Card className="max-w-[340px] p-5">
      <p className="text-label-secondary text-[12px]">Resultado do mês</p>
      <p className="text-[17px] font-semibold">Outubro</p>
      <div className="mt-3 flex flex-col gap-2 text-[13px]">
        {rows.map(([label, value, strong]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className={strong ? 'font-semibold' : 'text-label-secondary'}>{label}</span>
            <span className={cn('tabular-nums', strong && 'font-semibold')}>{value}</span>
          </div>
        ))}
      </div>
      <div className="border-foreground/[0.08] mt-3 flex items-end justify-between border-t pt-3">
        <span className="font-bold">Lucro</span>
        <span className="text-right">
          <span className="text-system-green block text-[22px] font-bold tabular-nums">
            R$ 8.403,60
          </span>
          <span className="text-label-secondary text-[11px]">margem 45,6%</span>
        </span>
      </div>
    </Card>
  );
}
