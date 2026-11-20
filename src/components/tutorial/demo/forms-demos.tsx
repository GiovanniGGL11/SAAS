'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangleIcon, CheckCircle2Icon, CheckIcon, MessageCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DemoPlayer,
  MiniButton,
  MiniField,
  MiniPhone,
  Pop,
  Typed,
  type DemoStep,
} from '@/components/tutorial/demo/demo-player';

/* Anamnese enviada pela agenda e respondida no celular (dados fictícios). */

const STEPS: DemoStep[] = [
  {
    caption: (
      <>
        No agendamento, em Fichas e registro, toque em <strong>Enviar pelo WhatsApp</strong>.
      </>
    ),
    target: 'send',
  },
  {
    caption: 'O WhatsApp abre com a mensagem pronta e o link da ficha. É só enviar.',
    target: 'link',
    duration: 3000,
  },
  {
    caption: 'O cliente preenche no celular. O CEP é conferido e o endereço aparece sozinho.',
    target: 'yes',
    duration: 4200,
  },
  {
    caption:
      'Perguntas extras aparecem conforme a resposta. No fim, ele assina com o dedo e envia.',
    target: 'submit',
    duration: 4400,
  },
  {
    caption:
      'A resposta chega na hora. O que foi marcado como alerta (alergia, medicamento) aparece em vermelho no prontuário.',
    duration: 4600,
  },
];

function Signature() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 120 30" className="h-6 w-full">
      <motion.path
        d="M5 20 C15 5, 22 28, 32 14 S48 6, 52 18 S66 26, 74 12 S92 8, 100 18 L114 14"
        className="stroke-foreground fill-none"
        strokeWidth="1.6"
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, delay: 1.4 }}
      />
    </svg>
  );
}

export function SendFormDemo() {
  return (
    <DemoPlayer title="Enviar a anamnese pelo WhatsApp" steps={STEPS} height={320}>
      {(step) => (
        <div className="flex h-full items-center gap-4 p-3">
          {/* Agendamento (computador) */}
          <div className="bg-tile flex min-w-0 flex-1 flex-col gap-2 self-stretch rounded-2xl p-3">
            <p className="text-[14px] font-bold">Maria Souza</p>
            <p className="text-label-secondary text-[11px]">
              Limpeza de pele · sex, 20 nov · 14:00
            </p>
            <p className="mt-1 text-[12px] font-semibold">Fichas e registro</p>
            <div className="bg-background flex items-center gap-2 rounded-xl p-2 text-[11px]">
              <span className="flex-1">
                <strong>Anamnese facial</strong>
                <br />
                {step >= 4 ? (
                  <span className="text-system-green font-semibold">Respondida agora</span>
                ) : step >= 1 ? (
                  <span className="text-system-orange">Enviada · aguardando</span>
                ) : (
                  <span className="text-label-secondary">Pendente</span>
                )}
              </span>
              {step === 0 && (
                <MiniButton demo="send" tone="green" className="h-6 px-2 text-[11px]">
                  <MessageCircleIcon className="size-3" /> Enviar pelo WhatsApp
                </MiniButton>
              )}
              {step >= 4 && <CheckCircle2Icon className="text-system-green size-5" />}
            </div>
            {step >= 4 && (
              <Pop className="bg-system-red/[0.08] flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px]">
                <AlertTriangleIcon className="text-system-red size-3.5" />
                <span>
                  <strong>Alergias:</strong> Dipirona · no topo do prontuário
                </span>
              </Pop>
            )}
          </div>

          {/* Celular do cliente */}
          <MiniPhone>
            {step <= 1 ? (
              <div className="flex h-full flex-col bg-[#e7ddd3] dark:bg-[#1b1b1b]">
                <div className="bg-[#075e54] px-2 py-1.5 text-[10px] font-semibold text-white">
                  Studio Bella
                </div>
                {step === 1 && (
                  <Pop className="m-2 rounded-lg bg-[#dcf8c6] p-2 text-[9.5px] leading-snug text-black">
                    Olá, Maria! Antes da sua Limpeza de pele (sex, 20/11 às 14:00), preencha sua
                    ficha:{' '}
                    <span data-demo="link" className="text-[#0645ad] underline">
                      atendafy.com/f/k3x9
                    </span>
                  </Pop>
                )}
              </div>
            ) : step <= 3 ? (
              <div className="flex flex-col gap-1.5 px-2.5">
                <p className="text-[12px] font-bold">Anamnese facial</p>
                {/* No passo seguinte a tela "rola": o CEP sai do alto para caber a assinatura. */}
                {step === 2 && (
                  <>
                    {' '}
                    <MiniField label="CEP" focused={step === 2}>
                      {step === 2 ? <Typed text="01310-100" speed={90} /> : '01310-100'}
                    </MiniField>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: step === 2 ? 1.3 : 0 }}
                      className="text-system-green flex items-start gap-1 leading-tight"
                    >
                      <CheckIcon className="mt-px size-3 shrink-0" /> Avenida Paulista, Bela Vista,
                      São Paulo/SP
                    </motion.p>
                  </>
                )}
                <span className="text-label-secondary mt-1">Tem alergia a algum medicamento?</span>
                <div className="flex gap-1">
                  {['Sim', 'Não'].map((o) => (
                    <span
                      key={o}
                      data-demo={o === 'Sim' ? 'yes' : undefined}
                      className={cn(
                        'flex-1 rounded-md border py-1 text-center',
                        step >= 3 && o === 'Sim'
                          ? 'border-system-blue bg-system-blue/10 text-system-blue font-semibold'
                          : 'border-foreground/15',
                      )}
                    >
                      {o}
                    </span>
                  ))}
                </div>
                {step >= 3 && (
                  <Pop className="flex flex-col gap-1.5">
                    <MiniField label="Qual?">
                      <Typed text="Dipirona" delay={300} />
                    </MiniField>
                    <span className="text-label-secondary">Assinatura</span>
                    <div className="border-foreground/20 rounded-md border border-dashed px-1">
                      <Signature />
                    </div>
                    <MiniButton demo="submit" className="h-6 justify-center text-[10px]">
                      Enviar ficha
                    </MiniButton>
                  </Pop>
                )}
              </div>
            ) : (
              <Pop className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
                <CheckCircle2Icon className="text-system-green size-8" />
                <p className="text-[12px] font-bold">Ficha enviada!</p>
                <p className="text-label-secondary">Obrigado, Maria. Até sexta.</p>
              </Pop>
            )}
          </MiniPhone>
        </div>
      )}
    </DemoPlayer>
  );
}
