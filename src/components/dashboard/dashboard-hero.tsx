'use client';

import { motion, useReducedMotion } from 'motion/react';

/** Large-title header with an Apple keynote–style word-by-word blur reveal. */
export function DashboardHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const reduceMotion = useReducedMotion();
  const words = title.split(' ');

  return (
    <header className="pt-2 pb-2 md:pt-6">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-label-secondary text-[13px] font-semibold tracking-[0.06em] uppercase"
      >
        {eyebrow}
      </motion.p>
      <h1 className="mt-2 text-[34px] leading-[1.08] font-bold tracking-[-0.03em] md:text-[48px]">
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="inline-block whitespace-pre"
            initial={reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, delay: 0.08 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </h1>
      <motion.p
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 + words.length * 0.07 }}
        className="text-label-secondary mt-3 max-w-xl text-[17px] leading-snug"
      >
        {subtitle}
      </motion.p>
    </header>
  );
}
