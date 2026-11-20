'use client';

import * as React from 'react';
import { CheckIcon, MessageCircleIcon, XCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DemoPlayer,
  MiniButton,
  MiniField,
  MiniPhone,
  MiniSwitch,
  MiniToast,
  Pop,
  Typed,
  type DemoStep,
} from '@/components/tutorial/demo/demo-player';

/* Estoque, Campanhas, Configurações e Comercial em miniatura (dados fictícios). */

// ── Estoque: materiais do serviço ───────────────────────────────────────────

const MATERIALS = [
  { name: 'Luva', per: '1 par', stock: 50, unit: 'par', use: 1 },
  { name: 'Máscara', per: '1 un', stock: 40, unit: 'un', use: 1 },
  { name: 'Touca', per: '1 un', stock: 40, unit: 'un', use: 1 },
  { name: 'Sérum', per: '20 ml', stock: 500, unit: 'ml', use: 20 },
];

const STOCK_STEPS: DemoStep[] = [
  {
    caption: (
      <>
        Abra o serviço e ligue <strong>Este serviço consome algo do estoque?</strong>
      </>
    ),
    target: 'consumes',
  },
  {
    caption:
      'Escolha cada material e quanto gasta por atendimento. Ao lado, para quantos atendimentos dá.',
    target: 'save-svc',
    duration: 4200,
  },
  { caption: 'Depois, é só concluir o atendimento normalmente.', target: 'finish' },
  {
    caption: 'Os materiais saem do estoque sozinhos. Desfez a conclusão ou cancelou? Eles voltam.',
    duration: 4600,
  },
];

export function StockDemo() {
  return (
    <DemoPlayer title="Materiais que saem sozinhos" steps={STOCK_STEPS} height={300}>
      {(step) => (
        <div className="relative flex h-full flex-col gap-2 p-4">
          {step <= 1 && (
            <>
              <p className="text-[15px] font-bold">Limpeza de pele</p>
              <div className="flex items-center gap-2 text-[12px]">
                <MiniSwitch on={step >= 1} demo="consumes" />
                Este serviço consome algo do estoque?
              </div>
              {step >= 1 && (
                <Pop className="flex flex-col gap-1">
                  {MATERIALS.map((m) => (
                    <div
                      key={m.name}
                      className="bg-tile grid grid-cols-[1fr_70px_1.3fr] items-center gap-2 rounded-lg px-2.5 py-1 text-[11px]"
                    >
                      <strong>{m.name}</strong>
                      <span className="bg-background border-foreground/15 rounded border px-1.5 py-0.5">
                        {m.per}
                      </span>
                      <span className="text-label-secondary">
                        {m.stock} {m.unit} em estoque · dá para {Math.floor(m.stock / m.use)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px]">
                      Custo de material por atendimento: <strong>R$ 6,40</strong>
                    </span>
                    <MiniButton demo="save-svc">Salvar serviço</MiniButton>
                  </div>
                </Pop>
              )}
            </>
          )}
          {step === 2 && (
            <Pop className="flex flex-col gap-2">
              <p className="text-[15px] font-bold">Comanda · Maria Souza</p>
              <div className="flex justify-between text-[12px]">
                <span>Limpeza de pele</span>
                <span>R$ 100,00</span>
              </div>
              <MiniButton demo="finish" tone="green" className="justify-center">
                Concluir e cobrar
              </MiniButton>
            </Pop>
          )}
          {step >= 3 && (
            <Pop className="flex flex-col gap-1">
              <p className="text-[15px] font-bold">Estoque</p>
              {MATERIALS.map((m) => (
                <div
                  key={m.name}
                  className="bg-tile flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]"
                >
                  <span>{m.name}</span>
                  <span className="tabular-nums">
                    <span className="text-label-secondary line-through">
                      {m.stock} {m.unit}
                    </span>{' '}
                    → <strong>{m.stock - m.use}</strong> {m.unit}
                  </span>
                </div>
              ))}
            </Pop>
          )}
        </div>
      )}
    </DemoPlayer>
  );
}

// ── Campanhas: cupom ────────────────────────────────────────────────────────

const COUPON_STEPS: DemoStep[] = [
  {
    caption: 'Em Cupons › Criar cupom: código, desconto (% ou R$), limite de usos e validade.',
    target: 'save-coupon',
    duration: 4200,
  },
  {
    caption: 'Na comanda (Concluir e cobrar), digite o código que o cliente falou.',
    target: 'finish',
    duration: 3600,
  },
  {
    caption:
      'O sistema confere se o cupom está ativo, na validade e dentro do limite, e o desconto entra sozinho.',
    duration: 4600,
  },
];

export function CouponDemo() {
  return (
    <DemoPlayer title="Criar e usar um cupom" steps={COUPON_STEPS} height={280}>
      {(step) => (
        <div className="relative flex h-full flex-col gap-2 p-4">
          {step === 0 ? (
            <Pop className="flex flex-col gap-2">
              <p className="text-[15px] font-bold">Criar cupom</p>
              <div className="grid grid-cols-2 gap-2">
                <MiniField label="Código" focused>
                  <Typed text="BEMVINDO10" />
                </MiniField>
                <MiniField label="Desconto">
                  <span className="flex items-center gap-1.5">
                    <span className="bg-system-blue/10 text-system-blue rounded px-1.5 font-semibold">
                      %
                    </span>
                    <span className="text-label-secondary">R$</span>
                    <span className="ml-1">10</span>
                  </span>
                </MiniField>
                <MiniField label="Limite de usos">50</MiniField>
                <MiniField label="Validade">31/12/2026</MiniField>
              </div>
              <MiniButton demo="save-coupon" className="self-end">
                Criar cupom
              </MiniButton>
            </Pop>
          ) : (
            <Pop className="flex flex-col gap-2">
              <p className="text-[15px] font-bold">Comanda · Maria Souza</p>
              <div className="flex justify-between text-[12px]">
                <span>Corte feminino</span>
                <span>R$ 80,00</span>
              </div>
              <div className="w-40">
                <MiniField label="Cupom" focused={step === 1}>
                  {step === 1 ? <Typed text="BEMVINDO10" speed={60} /> : 'BEMVINDO10'}
                </MiniField>
              </div>
              {step >= 2 && (
                <Pop className="text-system-green flex justify-between text-[12px]">
                  <span>Cupom BEMVINDO10 (10%)</span>
                  <span>− R$ 8,00</span>
                </Pop>
              )}
              <div className="border-foreground/10 flex justify-between border-t pt-2 text-[13px] font-bold">
                <span>Total</span>
                <span>{step >= 2 ? 'R$ 72,00' : 'R$ 80,00'}</span>
              </div>
              <MiniButton demo="finish" className="justify-center">
                Finalizar
              </MiniButton>
            </Pop>
          )}
          {step >= 2 && (
            <MiniToast>
              <CheckIcon className="text-system-green size-4" /> R$ 72,00 no caixa · cupom aplicado
            </MiniToast>
          )}
        </div>
      )}
    </DemoPlayer>
  );
}

// ── Configurações: WhatsApp automático ──────────────────────────────────────

const AUTOMATIONS = [
  { key: 'confirm', label: 'Confirmação ao marcar' },
  { key: 'reminder', label: 'Lembrete na véspera' },
  { key: 'review', label: 'Pedido de avaliação' },
  { key: 'birthday', label: 'Parabéns no aniversário' },
  { key: 'return', label: 'Retorno do paciente' },
];

const WHATS_STEPS: DemoStep[] = [
  {
    caption: 'Com o WhatsApp do salão conectado (Z-API), ligue as mensagens que quiser.',
    target: 'sw-reminder',
  },
  { caption: 'Cada uma sai sozinha, na hora certa.', target: 'sw-review' },
  {
    caption: 'Ex.: todo dia às 8h, o lembrete vai para os horários do dia seguinte.',
    duration: 4200,
  },
  {
    caption: 'Em Últimos envios você confere o que saiu e o que falhou.',
    duration: 4200,
  },
];

export function WhatsAppAutoDemo() {
  return (
    <DemoPlayer title="Ligar o WhatsApp automático" steps={WHATS_STEPS} height={320}>
      {(step) => {
        const on = (key: string) =>
          key === 'confirm' || (key === 'reminder' && step >= 1) || (key === 'review' && step >= 2);
        return (
          <div className="flex h-full items-center gap-4 p-3">
            <div className="bg-tile flex min-w-0 flex-1 flex-col gap-2 self-stretch rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-bold">WhatsApp automático</p>
                <span className="bg-system-green/12 text-system-green rounded-full px-2 py-0.5 text-[10px] font-semibold">
                  Conectado
                </span>
              </div>
              {step < 3 ? (
                AUTOMATIONS.map((a) => (
                  <div key={a.key} className="flex items-center gap-2 text-[12px]">
                    <MiniSwitch on={on(a.key)} demo={`sw-${a.key}`} />
                    {a.label}
                  </div>
                ))
              ) : (
                <Pop className="flex flex-col gap-1">
                  <p className="text-[12px] font-semibold">Últimos envios</p>
                  {[
                    ['Lembrete', 'Maria Souza', '08:00', true],
                    ['Lembrete', 'Diego Reis', '08:00', true],
                    ['Confirmação', 'Carla Lima', 'ontem', true],
                    ['Lembrete', 'Paulo (número inválido)', '08:00', false],
                  ].map(([kind, who, when, ok], i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      {ok ? (
                        <CheckIcon className="text-system-green size-3.5" />
                      ) : (
                        <XCircleIcon className="text-system-red size-3.5" />
                      )}
                      <span className="flex-1">
                        {kind} · {who}
                      </span>
                      <span className="text-label-secondary">{when}</span>
                    </div>
                  ))}
                </Pop>
              )}
            </div>
            <MiniPhone>
              <div className="flex h-full flex-col bg-[#e7ddd3] dark:bg-[#1b1b1b]">
                <div className="bg-[#075e54] px-2 py-1.5 text-[10px] font-semibold text-white">
                  Studio Bella
                </div>
                {step >= 2 && (
                  <Pop className="m-2 rounded-lg bg-white p-2 text-[9.5px] leading-snug text-black">
                    Oi, Maria! Lembrete: amanhã, 20/11, às 14:00, Limpeza de pele no Studio Bella.
                    Confirma?
                    <span className="mt-1 block text-right text-[8px] text-black/50">08:00</span>
                  </Pop>
                )}
              </div>
            </MiniPhone>
          </div>
        );
      }}
    </DemoPlayer>
  );
}

// ── Comercial: orçamento ────────────────────────────────────────────────────

const QUOTE_STEPS: DemoStep[] = [
  {
    caption:
      'Em Novo orçamento: cliente, nome, itens (com as sessões), desconto e condições de pagamento.',
    target: 'send',
    duration: 4400,
  },
  {
    caption: 'Envie o link: o cliente abre no celular e aprova ou recusa.',
    target: 'approve',
    duration: 3400,
  },
  { caption: 'Aprovado! Ele vai para a aba Aprovados.', target: 'convert' },
  {
    caption:
      'Converta em pacote, venda ou serviço em andamento. Nos ramos de saúde, vira o plano de tratamento do prontuário.',
    duration: 4800,
  },
];

export function QuoteDemo() {
  return (
    <DemoPlayer title="Orçamento até a aprovação" steps={QUOTE_STEPS} height={320}>
      {(step) => (
        <div className="relative flex h-full items-center gap-4 p-3">
          <div className="bg-tile flex min-w-0 flex-1 flex-col gap-2 self-stretch rounded-2xl p-3">
            {step === 0 ? (
              <>
                <p className="text-[14px] font-bold">Novo orçamento · Maria Souza</p>
                <MiniField label="Nome" focused>
                  <Typed text="Tratamento facial — 8 sessões" speed={50} />
                </MiniField>
                <div className="bg-background flex justify-between rounded-lg px-2.5 py-1.5 text-[11px]">
                  <span>Limpeza de pele · 8 sessões × R$ 100</span>
                  <span>R$ 800,00</span>
                </div>
                <div className="flex justify-between px-1 text-[11px]">
                  <span className="text-label-secondary">Desconto</span>
                  <span>− R$ 80,00</span>
                </div>
                <div className="flex justify-between px-1 text-[13px] font-bold">
                  <span>Total</span>
                  <span>R$ 720,00</span>
                </div>
                <p className="text-label-secondary px-1 text-[11px]">
                  3x no cartão ou PIX à vista · válido por 15 dias
                </p>
                <MiniButton demo="send" className="mt-auto self-end">
                  Enviar (gerar link)
                </MiniButton>
              </>
            ) : (
              <>
                <div className="bg-foreground/[0.06] flex self-start rounded-full p-0.5 text-[10px]">
                  {['Enviados', 'Aprovados', 'Recusados'].map((t) => (
                    <span
                      key={t}
                      className={cn(
                        'rounded-full px-2 py-0.5',
                        (step >= 2 ? t === 'Aprovados' : t === 'Enviados') &&
                          'bg-background font-semibold shadow-sm',
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="bg-background flex flex-col gap-1 rounded-xl p-2.5 text-[11px]">
                  <strong className="text-[12px]">Tratamento facial — 8 sessões</strong>
                  <span>Maria Souza · R$ 720,00</span>
                  <span
                    className={cn(
                      'self-start rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      step >= 2
                        ? 'bg-system-green/12 text-system-green'
                        : 'bg-system-orange/12 text-system-orange',
                    )}
                  >
                    {step >= 2 ? 'Aprovado agora' : 'Enviado · aguardando'}
                  </span>
                  {step >= 2 && (
                    <MiniButton demo="convert" tone="outline" className="mt-1 h-6 self-start">
                      Converter em pacote
                    </MiniButton>
                  )}
                </div>
              </>
            )}
          </div>
          <MiniPhone>
            {step === 0 ? (
              <div className="text-label-secondary flex h-full items-center justify-center px-4 text-center">
                <MessageCircleIcon className="mr-1 size-3" /> O cliente recebe o link
              </div>
            ) : step === 1 ? (
              <Pop className="flex flex-col gap-1.5 px-2.5">
                <p className="text-[11px] font-bold">Studio Bella · Orçamento</p>
                <p>Tratamento facial — 8 sessões</p>
                <div className="flex justify-between">
                  <span>Limpeza de pele × 8</span>
                  <span>R$ 800</span>
                </div>
                <div className="flex justify-between">
                  <span>Desconto</span>
                  <span>− R$ 80</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>R$ 720</span>
                </div>
                <MiniButton demo="approve" tone="green" className="mt-2 h-6 justify-center">
                  Aprovar
                </MiniButton>
                <MiniButton tone="outline" className="h-6 justify-center">
                  Recusar
                </MiniButton>
              </Pop>
            ) : (
              <Pop className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
                <CheckIcon className="text-system-green size-7" />
                <p className="text-[11px] font-bold">Orçamento aprovado</p>
              </Pop>
            )}
          </MiniPhone>
          {step >= 3 && (
            <MiniToast>
              <CheckIcon className="text-system-green size-4" /> Pacote criado: 8 sessões
            </MiniToast>
          )}
        </div>
      )}
    </DemoPlayer>
  );
}
