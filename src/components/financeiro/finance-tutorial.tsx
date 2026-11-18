'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CalculatorIcon,
  InfoIcon,
  LightbulbIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, Surface } from '@/components/layout/page';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { PRICING_PROBLEM_TEXT, calculatePricing, outcomeAt } from '@/lib/pricing';
import { FEATURE_TRIAL_DAYS } from '@/lib/billing/feature-trials';

/*
  Tutorial do Financeiro (Precificação e Lucro), dentro do sistema. A mini calculadora usa as
  MESMAS contas da aba Precificação (src/lib/pricing.ts), já com o exemplo do tutorial.
*/

const SECTIONS = [
  { id: 'planos', label: 'O que cada plano tem' },
  { id: 'antes', label: 'Antes de começar' },
  { id: 'gastos', label: '1. Meus gastos mensais' },
  { id: 'custo', label: '2. Custo do serviço ou produto' },
  { id: 'cobrar', label: '3. Quanto cobrar' },
  { id: 'simular', label: 'Simular e aplicar' },
  { id: 'exemplo', label: 'Exemplo resolvido' },
  { id: 'teste', label: 'Teste a conta' },
  { id: 'lucro', label: 'Aba Lucro (Pro)' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      {eyebrow && (
        <span className="text-system-blue text-[12px] font-semibold tracking-[0.08em] uppercase">
          {eyebrow}
        </span>
      )}
      <h2 className="text-[22px] font-bold tracking-[-0.02em] text-balance">{title}</h2>
      <div className="flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Lista "campo → o que é", no formato das telas de ajustes. */
function Fields({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Surface className="divide-foreground/[0.06] divide-y">
      {rows.map(([name, text]) => (
        <div
          key={name}
          className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-4 py-3 text-[14px] sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-4"
        >
          <span className="font-semibold">{name}</span>
          <span className="text-label-secondary">{text}</span>
        </div>
      ))}
    </Surface>
  );
}

function Tip({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl p-3.5 text-[14px]',
        tone === 'info' ? 'bg-system-blue/[0.08]' : 'bg-system-orange/10',
      )}
    >
      {tone === 'info' ? (
        <LightbulbIcon className="text-system-blue mt-0.5 size-4 shrink-0" />
      ) : (
        <InfoIcon className="text-system-orange mt-0.5 size-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}

function Path({ items }: { items: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
      {items.map((item, i) => (
        <React.Fragment key={item}>
          {i > 0 && <span className="text-label-secondary">›</span>}
          <span className="bg-tile rounded-full px-2.5 py-0.5">{item}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

function PriceCard({
  title,
  price,
  text,
  highlight,
  children,
}: {
  title: string;
  price: string;
  text?: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-2xl p-4',
        highlight ? 'bg-system-blue/8 ring-system-blue/30 ring-1' : 'bg-tile',
      )}
    >
      <span className="text-label-secondary text-[12px] font-medium">{title}</span>
      <span className="text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums">
        {price}
      </span>
      {children}
      {text && <p className="text-label-secondary text-[12px]">{text}</p>}
    </div>
  );
}

const EXAMPLE = {
  fixed: '2400',
  withdraw: '3600',
  hours: '160',
  occ: '75',
  minutes: '60',
  supplies: '20',
  rates: '10',
  margin: '20',
  price: '100',
  discount: '10',
};
type ExampleKey = keyof typeof EXAMPLE;

const num = (v: string) => {
  const raw = v.trim();
  const n = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(n) ? n : 0;
};
const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const money = (v: number | null) => (v === null ? '—' : formatCurrencyBRL(v));

/** A mesma conta da Precificação, com o exemplo do tutorial já preenchido. */
function TryCalculator() {
  const [v, setV] = React.useState(EXAMPLE);
  const set = (key: ExampleKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [key]: e.target.value.replace(/[^\d,.]/g, '') }));
  const inputs = {
    fixedMonthly: num(v.fixed),
    ownerWithdrawal: num(v.withdraw),
    availableHours: num(v.hours),
    occupancyPercent: num(v.occ),
    durationMinutes: num(v.minutes),
    supplies: num(v.supplies),
    otherDirectCosts: 0,
    fixedChargesPerService: 0,
    percentRates: num(v.rates) / 100,
    targetMargin: num(v.margin) / 100,
  };
  const r = calculatePricing(inputs);
  const price = num(v.price);
  const ok = r.problems.filter((p) => p === 'hours' || p === 'duration').length === 0;
  const now = outcomeAt(inputs, price);
  const withDiscount = outcomeAt(inputs, Math.max(0, price - Math.min(num(v.discount), price)));
  const fields: [ExampleKey, string][] = [
    ['fixed', 'Despesas fixas (R$/mês)'],
    ['withdraw', 'Retirada (R$/mês)'],
    ['hours', 'Horas no mês'],
    ['occ', 'Ocupação (%)'],
    ['minutes', 'Tempo na agenda (min)'],
    ['supplies', 'Insumos e custos diretos (R$)'],
    ['rates', 'Taxas sobre o preço (%)'],
    ['margin', 'Margem desejada (%)'],
    ['price', 'Preço atual (R$)'],
    ['discount', 'Desconto (R$)'],
  ];
  const tone = (n: number | null) =>
    n === null ? undefined : n < 0 ? 'text-system-red' : 'text-system-green';
  return (
    <Surface className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[17px] font-semibold">
          <CalculatorIcon className="text-system-blue size-5" /> Teste a conta
        </h3>
        <Button variant="outline" size="sm" onClick={() => setV(EXAMPLE)}>
          <RotateCcwIcon /> Voltar ao exemplo
        </Button>
      </div>
      <p className="text-label-secondary text-[14px]">
        A mesma conta da aba Precificação, já com os números do exemplo. Mude e veja o resultado na
        hora. Nada aqui é salvo.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {fields.map(([key, label]) => (
          <label key={key} className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-medium">{label}</span>
            <Input inputMode="decimal" value={v[key]} onChange={set(key)} aria-label={label} />
          </label>
        ))}
      </div>
      {r.problems.length > 0 && (
        <div className="bg-system-orange/10 rounded-2xl p-3 text-[13px]">
          {r.problems.map((p) => (
            <p key={p}>{PRICING_PROBLEM_TEXT[p]}</p>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <PriceCard title="Preço atual" price={money(price)}>
          {ok && (
            <div className="grid gap-0.5 text-[13px]">
              <span className="flex justify-between gap-2">
                <span className="text-label-secondary">Lucro</span>
                <strong className={cn('tabular-nums', tone(now.profit))}>
                  {money(now.profit)}
                </strong>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-label-secondary">Disponível por hora</span>
                <strong className="tabular-nums">{money(now.availablePerHour)}</strong>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-label-secondary">Lucro por hora</span>
                <strong className={cn('tabular-nums', tone(now.profitPerHour))}>
                  {money(now.profitPerHour)}
                </strong>
              </span>
            </div>
          )}
        </PriceCard>
        <PriceCard
          title="Preço mínimo"
          price={money(r.minPrice)}
          text="Lucro zero, com a sua retirada paga."
        />
        <PriceCard
          title={`Preço para margem de ${pct(inputs.targetMargin)}`}
          price={money(r.targetPrice)}
          text="Paga tudo e deixa a margem escolhida."
          highlight
        />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ['Horas atendendo', `${r.expectedHours.toLocaleString('pt-BR')} h`],
            ['Custo fixo por hora', money(r.fixedPerHour)],
            ['Retirada por hora', money(r.withdrawalPerHour)],
            ['Base do atendimento', money(r.base)],
            ['Lucro com desconto', ok ? money(withDiscount.profit) : '—'],
            ['Margem com desconto', ok ? pct(withDiscount.margin) : '—'],
          ] as const
        ).map(([label, value]) => (
          <span
            key={label}
            className="border-foreground/[0.08] flex justify-between gap-2 border-b border-dashed pb-1"
          >
            <span className="text-label-secondary">{label}</span>
            <strong className="tabular-nums">{value}</strong>
          </span>
        ))}
      </div>
    </Surface>
  );
}

export function FinanceTutorial() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Como usar a Precificação e o Lucro"
        description="Quanto cada atendimento custa de verdade, o menor preço que paga as contas e o seu salário, e quanto cobrar para ter lucro."
        actions={
          <Button variant="outline" asChild>
            <Link href="/financeiro?aba=precificacao">
              <ArrowLeftIcon /> Voltar ao Financeiro
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Neste tutorial"
          className="flex flex-wrap gap-1.5 self-start lg:sticky lg:top-24 lg:flex-col lg:gap-0.5"
        >
          <span className="text-label-secondary hidden px-2.5 pb-1 text-[12px] font-semibold tracking-[0.08em] uppercase lg:block">
            Neste tutorial
          </span>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="bg-tile lg:text-label-secondary hover:text-foreground lg:hover:bg-tile rounded-full px-3 py-1 text-[13px] transition-colors lg:rounded-lg lg:bg-transparent lg:px-2.5"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-12">
          <Section id="planos" title="O que cada plano tem">
            <div className="overflow-x-auto">
              <Surface className="min-w-[520px]">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-label-secondary border-foreground/[0.06] border-b text-[12px]">
                      <th className="px-4 py-2.5 text-left font-medium">Recurso</th>
                      <th className="px-3 py-2.5 text-left font-medium">Básico</th>
                      <th className="px-3 py-2.5 text-left font-medium">Profissional</th>
                      <th className="px-3 py-2.5 text-left font-medium">Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Fluxo de caixa, contas fixas e DRE simples', 1, 1, 1],
                        ['Calculadora de demonstração (números de exemplo)', 1, 1, 1],
                        ['Calculadora com os seus gastos, serviços e produtos', 0, 1, 1],
                        ['Salvar simulações e aplicar o preço no catálogo', 0, 1, 1],
                        ['DRE gerencial, ponto de equilíbrio, previsto × realizado', 0, 0, 1],
                        ['Ranking de lucro por serviço, produto e profissional', 0, 0, 1],
                      ] as const
                    ).map(([name, ...plans]) => (
                      <tr key={name} className="border-foreground/[0.06] border-b last:border-0">
                        <td className="px-4 py-2.5">{name}</td>
                        {plans.map((has, i) => (
                          <td
                            key={i}
                            className={cn(
                              'px-3 py-2.5',
                              has ? 'text-system-green font-semibold' : 'text-label-secondary',
                            )}
                          >
                            {has ? 'Sim' : 'Não'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Surface>
            </div>
            <p>
              Só o dono e os administradores veem estas abas. Se você trocar de plano, nada se
              perde: os números e as simulações salvas ficam guardados.
            </p>
            <Tip>
              <strong>Quer testar antes de assinar?</strong> Recursos que o seu plano não inclui têm
              o botão <strong>Testar grátis por {FEATURE_TRIAL_DAYS} dias</strong>. Ele libera de
              verdade, com os seus dados, uma vez por recurso e sem cobrança. A lista completa está
              em{' '}
              <Link href="/assinatura" className="text-system-blue underline">
                Assinatura
              </Link>
              .
            </Tip>
          </Section>

          <Section id="antes" title="Antes de começar">
            <p>
              A calculadora puxa dados de outras partes do sistema. Com eles em dia, você digita bem
              menos:
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>Contas fixas</strong> (Financeiro › Contas fixas): aluguel, luz, internet,
                sistema, contador. Elas viram as suas despesas fixas.
              </li>
              <li>
                <strong>Taxas da maquininha</strong> (Financeiro › Ajustes): a % de cada forma de
                pagamento.
              </li>
              <li>
                <strong>Materiais de cada serviço</strong> (Serviços › editar › &quot;Este serviço
                consome algo do estoque?&quot;): por exemplo, 1 par de luvas, 1 máscara e 20 ml de
                sérum, cada um com o custo por unidade no Estoque.
              </li>
              <li>
                <strong>Intervalo de preparo</strong> no serviço, se houver: ele entra no tempo que
                o atendimento ocupa na agenda.
              </li>
            </ul>
          </Section>

          <Section id="gastos" eyebrow="Parte 1" title="Meus gastos mensais">
            <p>
              Aqui você conta o que custa manter o negócio aberto e quanto quer receber pelo seu
              trabalho. Preencha uma vez e clique em <strong>Salvar</strong>; vale para todos os
              serviços.
            </p>
            <Fields
              rows={[
                [
                  'Usar as contas fixas cadastradas',
                  'Ligado, soma as contas fixas que você já tem. O total aparece ao lado.',
                ],
                ['Outras despesas fixas', 'O que não está nas contas fixas, por mês.'],
                [
                  'Retirada do dono',
                  'Quanto você quer tirar por mês para você (pró-labore). Em zero, o preço mínimo não paga o seu trabalho.',
                ],
                [
                  'Horas para atender no mês',
                  'De toda a equipe. Ex.: 8 h × 20 dias = 160 h por pessoa.',
                ],
                [
                  'Ocupação esperada da agenda',
                  'Quanto dessas horas você costuma preencher. 160 h a 75% = 120 h atendendo.',
                ],
                ['Impostos sobre a venda', 'A sua alíquota (Simples, MEI...), em % do preço.'],
                [
                  'Margem de lucro desejada',
                  'Quanto do preço você quer que sobre como lucro, depois de tudo pago.',
                ],
                ['Forma de pagamento mais comum', 'Define a taxa da maquininha usada na conta.'],
              ]}
            />
            <p>
              Embaixo aparecem o <strong>custo fixo por hora</strong> e a{' '}
              <strong>retirada por hora</strong>: quanto cada hora de agenda precisa render para
              pagar as contas e o seu salário.
            </p>
          </Section>

          <Section id="custo" eyebrow="Parte 2" title="Custo deste produto ou serviço">
            <p>
              Escolha <strong>Serviço</strong> ou <strong>Produto de revenda</strong>. No serviço, o
              preço, o tempo e os materiais já vêm do cadastro.
            </p>
            <Fields
              rows={[
                [
                  'Tempo na agenda',
                  'Duração mais o preparo e a limpeza: o tempo em que você não pode atender outra pessoa.',
                ],
                [
                  'Insumos',
                  'Para cada um: preço da embalagem, quanto ela rende e quanto gasta por atendimento. Frasco de 500 ml por R$ 80, gastando 25 ml: R$ 4,00 por atendimento.',
                ],
                [
                  'Outros custos diretos',
                  'O que sai a cada atendimento e não está no estoque, como a lavanderia da toalha.',
                ],
                [
                  'Taxa fixa por atendimento',
                  'Tarifas em reais, como uma tarifa fixa por transação.',
                ],
                [
                  'Comissão',
                  '% do preço ou valor fixo. Vem da regra do serviço ou da equipe; se cada profissional ganha diferente, escolha o valor da simulação.',
                ],
              ]}
            />
            <h3 className="pt-1 text-[16px] font-semibold">Produto de revenda</h3>
            <Fields
              rows={[
                ['Paguei no lote e unidades', 'R$ 300 por 10 unidades = R$ 30 cada.'],
                ['Frete da compra', 'Do lote todo; é dividido pelas unidades.'],
                ['Embalagem por unidade', 'Sacola, caixinha, laço.'],
                [
                  'Parte das despesas por unidade',
                  'Opcional, se quiser que cada produto ajude a pagar a loja.',
                ],
              ]}
            />
          </Section>

          <Section id="cobrar" eyebrow="Parte 3" title="Quanto cobrar">
            <p>Três cartões lado a lado. Cada um mostra o que sobra se você cobrar aquele preço:</p>
            <div className="grid max-w-none gap-3 md:grid-cols-3">
              <PriceCard
                title="Preço atual"
                price="R$ 100,00"
                text="O que você cobra hoje. Abaixo do mínimo, aparece um aviso em vermelho."
              />
              <PriceCard
                title="Preço mínimo sustentável"
                price="R$ 77,78"
                text="Paga os custos, as taxas e a sua retirada, com lucro zero."
              />
              <PriceCard
                title="Preço para margem de 20%"
                price="R$ 100,00"
                text="Paga tudo e ainda deixa a margem que você escolheu."
                highlight
              />
            </div>
            <Fields
              rows={[
                [
                  'Lucro por atendimento',
                  'O que sobra depois de taxas, custos, a parte das contas fixas e a sua retirada.',
                ],
                ['Margem', 'Lucro ÷ preço.'],
                [
                  'Disponível por hora',
                  'Quanto cada hora deixa para pagar você e dar lucro, depois de taxas, custos e contas fixas.',
                ],
                ['Lucro por hora', 'O que sobra por hora depois de reservar a sua retirada.'],
              ]}
            />
            <Tip tone="warn">
              <strong>Viu um aviso laranja?</strong> Ele explica o que falta: horas ou ocupação em
              zero, tempo do atendimento em branco, ou taxas + margem chegando a 100% (aí nenhum
              preço fecha a conta; baixe a margem).
            </Tip>
          </Section>

          <Section id="simular" title="Simular e aplicar">
            <p>Logo abaixo dos cartões há três simulações com o preço atual:</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>E se eu der desconto?</strong> Digite o desconto em reais e veja quanto do
                lucro ele leva.
              </li>
              <li>
                <strong>E se a agenda encher (ou esvaziar)?</strong> O preço mínimo e o lucro com
                50%, 60%, 75%, 90% e 100% de ocupação.
              </li>
              <li>
                <strong>E se o cliente pagar de outro jeito?</strong> O lucro em cada forma de
                pagamento, com a taxa de cada uma.
              </li>
            </ul>
            <p>
              <strong>Salvar:</strong> dê um nome (por exemplo, &quot;Limpeza com sérum novo&quot;)
              e clique em <strong>Salvar simulação</strong>. Ela fica na lista Simulações salvas.
            </p>
            <p>
              <strong>Aplicar o preço:</strong> no cartão do preço mínimo ou do preço para a meta,
              clique em <strong>Aplicar preço</strong> e confirme. O novo preço passa a valer no
              catálogo e no link de agendamento. Atendimentos já marcados mantêm o preço combinado.
            </p>
          </Section>

          <Section id="exemplo" title="Exemplo resolvido">
            <p>
              Uma limpeza de pele de 1 hora, com R$ 20 de insumos, R$ 2.400 de despesas fixas, R$
              3.600 de retirada, 160 h a 75% de ocupação (120 h), 10% de taxas (6% de imposto + 4%
              do cartão de crédito) e margem desejada de 20%.
            </p>
            <Surface className="divide-foreground/[0.06] divide-y text-[14px] tabular-nums">
              {(
                [
                  ['Custo fixo por hora: 2.400 ÷ 120', 'R$ 20,00', false],
                  ['Retirada por hora: 3.600 ÷ 120', 'R$ 30,00', false],
                  ['Base: 20 + 1 h × (20 + 30)', 'R$ 70,00', true],
                  ['Preço mínimo: 70 ÷ (1 − 0,10)', 'R$ 77,78', false],
                  ['Preço para a meta: 70 ÷ (1 − 0,10 − 0,20)', 'R$ 100,00', true],
                ] as const
              ).map(([label, value, strong]) => (
                <div key={label} className="flex flex-wrap justify-between gap-3 px-4 py-2.5">
                  <span className={strong ? 'font-semibold' : 'text-label-secondary'}>{label}</span>
                  <span className={cn(strong && 'font-semibold')}>{value}</span>
                </div>
              ))}
            </Surface>
            <p>
              Cobrando <strong>R$ 100</strong>: sobram R$ 90 depois das taxas. Tirando R$ 20 de
              insumos e R$ 20 de custo fixo, ficam <strong>R$ 50,00 disponíveis por hora</strong>.
              Tirando ainda R$ 30 da retirada, ficam <strong>R$ 20,00 de lucro por hora</strong>.
            </p>
            <p>
              Com <strong>R$ 10 de desconto</strong> (cliente paga R$ 90): 90 × 0,90 − 20 − 20 − 30
              = <strong>R$ 11,00 de lucro</strong>, uma margem de <strong>12,22%</strong>. O
              desconto de R$ 10 levou quase metade do lucro.
            </p>
          </Section>

          <section id="teste" className="scroll-mt-24">
            <TryCalculator />
          </section>

          <Section id="lucro" eyebrow="Plano Pro" title="Aba Lucro">
            <Path items={['Financeiro', 'Lucro']} />
            <p>
              Mostra o lucro de verdade do mês. Use as setas para trocar de mês e a chave no topo
              para escolher como contar:
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>Competência</strong>: o que foi feito no mês, pago ou a receber. O custo é o
                dos materiais usados e dos produtos vendidos. Use para saber se o mês deu lucro.
              </li>
              <li>
                <strong>Caixa</strong>: só o que entrou e saiu da conta no mês, pela data do
                pagamento. As compras de mercadoria entram como custo. Use para saber se sobrou
                dinheiro.
              </li>
            </ul>
            <Fields
              rows={[
                ['Receita bruta', 'Tudo o que foi vendido, antes dos descontos, por tipo.'],
                ['(−) Descontos e cupons', 'O desconto dado em cada comanda.'],
                ['(−) Estornos', 'O que foi recebido e depois desfeito.'],
                [
                  '(−) Impostos',
                  'Estimados pela sua alíquota da Precificação; sem alíquota, o lançado em "Impostos".',
                ],
                ['(−) Taxas de cartão e PIX', 'As taxas da maquininha de cada recebimento.'],
                ['Receita líquida', 'O que é seu de fato.'],
                ['(−) CMV', 'Quanto custaram os produtos vendidos, pelo custo do dia da venda.'],
                [
                  '(−) Materiais (CSP)',
                  'O que os atendimentos gastaram do estoque, pelo custo do dia.',
                ],
                ['(−) Comissões', 'Calculadas sobre os atendimentos do mês (no Caixa: as pagas).'],
                ['Lucro bruto', 'O que os atendimentos e vendas deixaram.'],
                ['(−) Despesas', 'Aluguel, contas, salários e outras, por categoria.'],
                ['Lucro líquido', 'O resultado do mês.'],
              ]}
            />
            <p>
              <strong>Clique em qualquer linha sublinhada</strong> para ver os lançamentos que
              formam aquele valor.
            </p>
            <p>
              <strong>Pacotes não contam duas vezes.</strong> A receita do pacote entra no dia da
              venda. Quando o cliente usa uma sessão, ela aparece num aviso abaixo do DRE como
              &quot;sessão já paga&quot;, sem somar de novo.
            </p>
            <p>
              <strong>&quot;≈ estimado&quot;</strong> aparece quando um valor não é exato: impostos
              calculados pela alíquota, ou movimentos de estoque antigos que usam o custo atual do
              produto.
            </p>
            <p>
              <strong>Ponto de equilíbrio:</strong> quanto faturar no mês para pagar as despesas
              fixas, e quantos atendimentos isso dá com o seu ticket médio.{' '}
              <strong>Previsto × realizado:</strong> os atendimentos concluídos mais os marcados,
              contra o que já foi concluído e pago. <strong>O que mais dá lucro:</strong> ranking
              por serviço, produto ou profissional, com quanto cada hora de agenda rende.
            </p>
            <Tip>
              Um serviço pode faturar muito e render pouco por hora. Olhe a coluna{' '}
              <strong>Por hora</strong> antes de decidir o que divulgar mais.
            </Tip>
          </Section>

          <Section id="duvidas" title="Dúvidas comuns">
            {(
              [
                [
                  'Meu preço mínimo ficou alto. O que faço?',
                  'Confira a ocupação e as horas: agenda vazia faz cada hora carregar mais custo fixo. Veja também se a retirada e as despesas fixas estão certas. Às vezes o preço é que está baixo mesmo.',
                ],
                [
                  'Aplicar o preço muda os atendimentos já marcados?',
                  'Não. Eles mantêm o preço combinado. O novo preço vale para os próximos agendamentos e para o link público.',
                ],
                [
                  'Preciso salvar os gastos toda vez?',
                  'Não. Salve uma vez em Meus gastos mensais e atualize quando algo mudar (um aluguel novo, mais uma profissional, outra alíquota).',
                ],
                [
                  'Trabalho com equipe. Como preencho as horas?',
                  'Some as horas de todas as pessoas que atendem. As despesas fixas são da empresa toda, então se dividem pelas horas da equipe inteira.',
                ],
                [
                  'Por que o Caixa e a Competência dão resultados diferentes?',
                  'Um atendimento no fiado entra na Competência no dia em que foi feito e no Caixa só quando o cliente pagar. Uma compra grande de estoque pesa no Caixa do mês da compra, e na Competência só conforme o material é usado.',
                ],
                [
                  'Se eu mudar de plano, perco o que salvei?',
                  'Não. Os gastos e as simulações ficam guardados e voltam a aparecer quando o plano incluir a calculadora de novo.',
                ],
              ] as const
            ).map(([q, a]) => (
              <details key={q} className="bg-tile group rounded-2xl px-4 py-3">
                <summary className="cursor-pointer font-semibold">{q}</summary>
                <p className="text-label-secondary mt-2 text-[14px]">{a}</p>
              </details>
            ))}
          </Section>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/financeiro?aba=precificacao">Abrir a Precificação</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/financeiro?aba=lucro">Abrir o Lucro</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
