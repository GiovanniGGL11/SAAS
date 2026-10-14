'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Sobe e aparece ao entrar na tela (uma vez). */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      <p className="text-system-blue text-[15px] font-semibold">{eyebrow}</p>
      <h2 className="mt-2 text-[32px] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[48px]">
        {title}
      </h2>
      {subtitle && (
        <p className="text-label-secondary mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-balance">
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
