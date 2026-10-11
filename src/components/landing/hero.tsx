'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;

function RevealWords({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const words = text.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className={`inline-block whitespace-pre ${className ?? ''}`}
          initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: delay + i * 0.06, ease: EASE }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </>
  );
}

/**
 * Landing hero: keynote-style headline reveal over drifting aurora blobs that
 * also lean toward the cursor (spring-smoothed parallax).
 */
export function Hero() {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 50, damping: 20 });
  const smoothY = useSpring(pointerY, { stiffness: 50, damping: 20 });
  const blobX = useTransform(smoothX, (v) => v * 40);
  const blobY = useTransform(smoothY, (v) => v * 40);
  const blobXInv = useTransform(smoothX, (v) => v * -30);
  const blobYInv = useTransform(smoothY, (v) => v * -30);

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <section
      onPointerMove={handlePointerMove}
      className="relative isolate overflow-hidden px-5 pt-20 pb-16 text-center md:pt-32 md:pb-24"
    >
      {/* Aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          style={{ x: blobX, y: blobY }}
          className="absolute top-[-10%] left-[10%] size-[42rem] max-w-[90vw]"
        >
          <div className="animate-aurora bg-system-blue/25 size-full rounded-full blur-[110px]" />
        </motion.div>
        <motion.div
          style={{ x: blobXInv, y: blobYInv }}
          className="absolute top-[5%] right-[5%] size-[36rem] max-w-[80vw]"
        >
          <div
            className="animate-aurora bg-system-indigo/25 size-full rounded-full blur-[110px]"
            style={{ animationDelay: '-6s' }}
          />
        </motion.div>
        <motion.div
          style={{ x: blobXInv, y: blobY }}
          className="absolute top-[35%] left-[35%] size-[28rem] max-w-[70vw]"
        >
          <div
            className="animate-aurora size-full rounded-full bg-[#ff2d55]/15 blur-[110px]"
            style={{ animationDelay: '-12s' }}
          />
        </motion.div>
        <div className="from-background absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent" />
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <Link
          href="/sign-up"
          className="bg-background/60 ring-foreground/10 text-foreground/80 hover:text-foreground group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 backdrop-blur-md transition-colors"
        >
          <span className="bg-system-green size-1.5 rounded-full" />
          Agenda, clientes e financeiro em um só lugar
          <ChevronRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>

      <h1 className="mx-auto mt-7 max-w-4xl text-[40px] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[56px] md:text-[76px]">
        <RevealWords text="O SaaS de agendamentos" delay={0.1} />{' '}
        <RevealWords
          text="mais completo do Brasil."
          delay={0.35}
          className="from-system-blue bg-gradient-to-r via-[#7d5cf6] to-[#ff2d55] bg-clip-text pb-2 text-transparent"
        />
      </h1>

      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
        className="text-label-secondary mx-auto mt-6 max-w-xl text-[19px] leading-relaxed text-balance md:text-[21px]"
      >
        Agenda, clientes, profissionais, estoque e financeiro trabalhando juntos, para você cuidar
        do que importa: o seu negócio.
      </motion.p>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
        className="mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href="/sign-up"
          className="bg-system-blue group inline-flex items-center gap-2 rounded-full px-7 py-3 text-[17px] font-medium text-white shadow-[0_10px_30px_-10px_var(--system-blue)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Começar agora
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/sign-in"
          className="text-system-blue inline-flex items-center gap-1 rounded-full px-5 py-3 text-[17px] font-medium hover:underline"
        >
          Já tenho conta
          <ChevronRightIcon className="size-4" />
        </Link>
      </motion.div>
    </section>
  );
}
