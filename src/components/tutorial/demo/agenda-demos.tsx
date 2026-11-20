'use client';

import * as React from 'react';
import { CheckIcon, MessageCircleIcon, PlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DemoPlayer,
  MiniButton,
  MiniField,
  MiniToast,
  Pop,
  Typed,
  type DemoStep,
} from '@/components/tutorial/demo/demo-player';

/* Agenda em miniatura (dados fictícios): dois profissionais, das 9h às 12h. */

const ROW = 56;
const TIME_COL = 44;
/** Largura de cada profissional: palco de 520 menos o respiro (24), a borda (2) e as horas. */
const COL = (520 - 24 - 2 - TIME_COL) / 2;
const HOURS = ['09:00', '10:00', '11:00'];

type Block = {
  pro: 0 | 1;
  hour: number;
  title: string;
  sub: string;
  tone: 'blue' | 'orange' | 'green';
  demo?: string;
};

const TONE = {
  blue: 'bg-system-blue/15 border-system-blue text-foreground',
  orange: 'bg-system-orange/15 border-system-orange text-foreground',
  green: 'bg-system-green/15 border-system-green text-foreground',
};

function MiniAgenda({ blocks, slotDemo }: { blocks: Block[]; slotDemo?: boolean }) {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold">Qui, 19 nov</span>
        <span className="bg-foreground/[0.06] ml-2 flex rounded-full p-0.5 text-[11px]">
          <span className="bg-background rounded-full px-2.5 py-0.5 font-semibold shadow-sm">
            Dia
          </span>
          <span className="px-2.5 py-0.5">Semana</span>
          <span className="px-2.5 py-0.5">Mês</span>
        </span>
        <MiniButton className="ml-auto">
          <PlusIcon className="size-3.5" /> Criar
        </MiniButton>
      </div>
      <div className="border-foreground/10 relative flex-1 overflow-hidden rounded-xl border">
        <div className="border-foreground/10 grid grid-cols-[44px_1fr_1fr] border-b text-[12px] font-semibold">
          <span />
          <span className="px-2 py-1.5">Ana</span>
          <span className="border-foreground/10 border-l px-2 py-1.5">Bruno</span>
        </div>
        <div className="relative grid grid-cols-[44px_1fr_1fr]">
          {HOURS.map((h, i) => (
            <React.Fragment key={h}>
              <span
                className="text-label-secondary border-foreground/[0.06] border-b px-1.5 pt-1 text-[10px]"
                style={{ height: ROW }}
              >
                {h}
              </span>
              <span
                data-demo={i === 1 && slotDemo ? 'slot' : undefined}
                className="border-foreground/[0.06] border-b"
              />
              <span className="border-foreground/[0.06] border-b border-l" />
            </React.Fragment>
          ))}
          {blocks.map((b) => (
            <Pop key={`${b.pro}-${b.hour}`} className="absolute inset-0">
              <div
                data-demo={b.demo}
                className={cn(
                  'absolute rounded-lg border-l-[3px] px-2 py-1 text-[11px]',
                  TONE[b.tone],
                )}
                // Posição na grade: coluna do profissional e linha da hora.
                style={{
                  top: b.hour * ROW + 2,
                  left: TIME_COL + b.pro * COL + 3,
                  width: COL - 6,
                  height: ROW - 4,
                }}
              >
                <div className="font-semibold">{b.title}</div>
                <div className="text-label-secondary">{b.sub}</div>
              </div>
            </Pop>
          ))}
        </div>
      </div>
    </div>
  );
}

const BASE: Block[] = [
  { pro: 0, hour: 0, title: 'Carla Lima', sub: 'Escova · Confirmado', tone: 'blue' },
  { pro: 1, hour: 2, title: 'Diego Reis', sub: 'Barba · A confirmar', tone: 'orange' },
];

function Dialog({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-foreground/20 absolute inset-0 z-30 flex items-center justify-center">
      <Pop className="bg-background w-[300px] rounded-2xl p-4 shadow-xl">{children}</Pop>
    </div>
  );
}

const BOOK_STEPS: DemoStep[] = [
  {
    caption: (
      <>
        Clique num horário vazio (ou no botão <strong>Criar</strong>, ou na tecla C).
      </>
    ),
    target: 'slot',
  },
  {
    caption:
      'Digite o nome e escolha o cliente. Cliente novo? Cadastre ali mesmo, com nome e telefone.',
    target: 'client-option',
    duration: 3400,
  },
  {
    caption: 'Escolha o serviço. Dá para somar outro serviço no mesmo horário.',
    target: 'service-option',
  },
  { caption: 'Confira e clique em Salvar.', target: 'save', duration: 2400 },
  {
    caption: (
      <>
        <strong>Horário marcado!</strong> Mande a confirmação pelo WhatsApp com um toque (ou ela sai
        sozinha, se o automático estiver ligado).
      </>
    ),
    target: 'whats',
    duration: 4000,
  },
];

export function BookAppointmentDemo() {
  return (
    <DemoPlayer title="Marcar um horário" steps={BOOK_STEPS} height={300}>
      {(step) => {
        const booked: Block = {
          pro: 0,
          hour: 1,
          title: 'Maria Souza',
          sub: 'Corte feminino · A confirmar',
          tone: 'orange',
        };
        return (
          <div className="relative h-full">
            <MiniAgenda blocks={step >= 4 ? [...BASE, booked] : BASE} slotDemo />
            {step >= 1 && step <= 3 && (
              <Dialog>
                <p className="text-[15px] font-bold">Novo agendamento</p>
                <p className="text-label-secondary mb-3 text-[11px]">Qui, 19 nov · 10:00 · Ana</p>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <MiniField label="Cliente" focused={step === 1}>
                      {step === 1 ? <Typed text="Mar" /> : 'Maria Souza'}
                    </MiniField>
                    {step === 1 && (
                      <Pop className="bg-background border-foreground/10 absolute top-full right-0 left-0 z-10 mt-1 rounded-lg border p-1 shadow-md">
                        <div
                          data-demo="client-option"
                          className="bg-system-blue/10 rounded-md px-2 py-1.5 text-[12px]"
                        >
                          <strong>Maria Souza</strong>{' '}
                          <span className="text-label-secondary">(11) 9 8123-4567</span>
                        </div>
                        <div className="text-label-secondary px-2 py-1.5 text-[12px]">
                          + Cadastrar &quot;Mar...&quot;
                        </div>
                      </Pop>
                    )}
                  </div>
                  <div className="relative">
                    <MiniField label="Serviço" focused={step === 2}>
                      {step >= 3 ? (
                        'Corte feminino · 1h · R$ 80'
                      ) : (
                        <span className="text-label-secondary">Escolha o serviço</span>
                      )}
                    </MiniField>
                    {step === 2 && (
                      <Pop className="bg-background border-foreground/10 absolute top-full right-0 left-0 z-10 mt-1 rounded-lg border p-1 shadow-md">
                        <div
                          data-demo="service-option"
                          className="bg-system-blue/10 rounded-md px-2 py-1.5 text-[12px]"
                        >
                          Corte feminino · 1h · R$ 80
                        </div>
                        <div className="px-2 py-1.5 text-[12px]">Escova · 45 min · R$ 60</div>
                      </Pop>
                    )}
                  </div>
                  <MiniField label="Profissional">Ana</MiniField>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <MiniButton tone="ghost">Cancelar</MiniButton>
                  <MiniButton demo="save">Salvar</MiniButton>
                </div>
              </Dialog>
            )}
            {step >= 4 && (
              <Dialog>
                <p className="text-[15px] font-bold">Horário marcado!</p>
                <p className="text-label-secondary mt-1 text-[12px]">
                  Maria Souza · Corte feminino · qui, 19 nov às 10:00 com Ana
                </p>
                <div className="bg-system-green/10 mt-3 rounded-xl p-2.5 text-[11px] leading-snug">
                  Olá, Maria! Seu horário de Corte feminino está marcado para quinta, 19/11, às
                  10:00. Confirma?
                </div>
                <div className="mt-3 flex justify-end">
                  <MiniButton demo="whats" tone="green">
                    <MessageCircleIcon className="size-3.5" /> Enviar pelo WhatsApp
                  </MiniButton>
                </div>
              </Dialog>
            )}
          </div>
        );
      }}
    </DemoPlayer>
  );
}

const CHECKOUT_STEPS: DemoStep[] = [
  { caption: 'Toque no cartão para abrir o agendamento.', target: 'maria' },
  {
    caption: (
      <>
        Terminou o atendimento? Toque em <strong>Concluir e cobrar</strong>.
      </>
    ),
    target: 'checkout',
  },
  {
    caption: 'Na comanda, escolha a forma de pagamento. Dá para dividir entre duas (PIX + cartão).',
    target: 'pix',
  },
  { caption: 'Confira o total e finalize.', target: 'finish', duration: 2400 },
  {
    caption:
      'Pronto: o valor entra no Financeiro, já com a comissão do profissional e a taxa da maquininha.',
    duration: 4000,
  },
];

const PAYMENTS = ['PIX', 'Dinheiro', 'Crédito', 'Débito'];

export function CheckoutDemo() {
  return (
    <DemoPlayer title="Concluir e cobrar" steps={CHECKOUT_STEPS} height={300}>
      {(step) => {
        const maria: Block = {
          pro: 0,
          hour: 1,
          title: 'Maria Souza',
          sub: step >= 4 ? 'Corte feminino · Concluído' : 'Corte feminino · Confirmado',
          tone: step >= 4 ? 'green' : 'blue',
          demo: 'maria',
        };
        return (
          <div className="relative h-full">
            <MiniAgenda blocks={[...BASE, maria]} />
            {(step === 1 || step === 2 || step === 3) && (
              <Pop className="bg-background border-foreground/10 absolute top-0 right-0 bottom-0 z-30 w-[250px] border-l p-4 shadow-xl">
                {step === 1 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[15px] font-bold">Maria Souza</p>
                    <p className="text-label-secondary text-[12px]">
                      Corte feminino · 10:00–11:00 · Ana
                    </p>
                    <span className="bg-system-blue/12 text-system-blue self-start rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      Confirmado
                    </span>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <MiniButton tone="outline">Iniciar atendimento</MiniButton>
                      <MiniButton demo="checkout" tone="green">
                        <CheckIcon className="size-3.5" /> Concluir e cobrar
                      </MiniButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[15px] font-bold">Comanda</p>
                    <div className="flex justify-between text-[12px]">
                      <span>Corte feminino</span>
                      <span>R$ 80,00</span>
                    </div>
                    <span className="text-system-blue text-[11px]">+ Adicionar produto</span>
                    <span className="text-label-secondary mt-1 text-[11px]">
                      Forma de pagamento
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {PAYMENTS.map((p) => (
                        <span
                          key={p}
                          data-demo={p === 'PIX' ? 'pix' : undefined}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[11px]',
                            step >= 3 && p === 'PIX'
                              ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                              : 'border-foreground/15',
                          )}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="border-foreground/10 mt-2 flex justify-between border-t pt-2 text-[13px] font-bold">
                      <span>Total</span>
                      <span>R$ 80,00</span>
                    </div>
                    <MiniButton demo="finish" className="justify-center">
                      Finalizar
                    </MiniButton>
                  </div>
                )}
              </Pop>
            )}
            {step >= 4 && (
              <MiniToast>
                <CheckIcon className="text-system-green size-4" /> R$ 80,00 no caixa · PIX
              </MiniToast>
            )}
          </div>
        );
      }}
    </DemoPlayer>
  );
}
