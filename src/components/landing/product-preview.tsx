'use client';

import * as React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

import { KpiTile } from '@/components/dashboard/kpi-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import type { DailyRevenue } from '@/server/data/dashboard';

const DEMO_REVENUE: DailyRevenue[] = [
  320, 480, 260, 610, 720, 540, 880, 950, 640, 1020, 1180, 860, 1340, 1260,
].map((revenue, i) => ({
  date: { year: 2026, month: 10, day: i + 1 },
  label: `${String(i + 1).padStart(2, '0')}/10`,
  revenue,
}));

/**
 * The real dashboard components, fed with sample data, inside a window frame
 * that tilts up and settles flat as it scrolls into view (Apple product-reveal).
 */
export function ProductPreview() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.3, 1]);

  return (
    <section className="px-5 pb-24 md:pb-32" style={{ perspective: 1400 }}>
      <motion.div
        ref={ref}
        style={
          reduceMotion ? undefined : { rotateX, scale, opacity, transformOrigin: 'center top' }
        }
        className="bg-background ring-foreground/10 mx-auto max-w-5xl overflow-hidden rounded-[28px] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.45)] ring-1"
      >
        <div className="border-foreground/[0.06] flex items-center gap-2 border-b px-5 py-3.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="text-label-secondary ml-3 text-xs">Dashboard · dados de exemplo</span>
        </div>
        <div className="font-apple pointer-events-auto grid gap-3 p-4 md:gap-4 md:p-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <KpiTile index={0} label="Faturamento" value={9840.5} format="currency" delta={12.4} />
            <KpiTile index={1} label="Ticket médio" value={142.3} format="currency" delta={4.1} />
            <KpiTile index={2} label="Atendimentos" value={129} format="integer" delta={8.2} />
            <KpiTile index={3} label="Novos clientes" value={23} format="integer" delta={15.0} />
          </div>
          <AppleTile interactive={false}>
            <TileEyebrow>Faturamento por dia</TileEyebrow>
            <div className="mt-1 mb-4 text-[24px] leading-none font-semibold tracking-[-0.025em]">
              R$ 11.060,00
            </div>
            <RevenueChart data={DEMO_REVENUE} />
          </AppleTile>
        </div>
      </motion.div>
    </section>
  );
}
