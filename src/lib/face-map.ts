/*
  Mapa facial (prontuário de estética e harmonização). Cada aplicação guarda os pontos marcados no
  desenho do rosto, em porcentagem da largura (x) e da altura (y) do desenho, com a região, o
  produto e a quantidade. A região é sugerida pela posição; a profissional pode trocar.
*/

export const FACE_UNITS = ['U', 'ml', 'seringa', 'fio', 'outro'] as const;
export type FaceUnit = (typeof FACE_UNITS)[number];
export const FACE_UNIT_LABEL: Record<FaceUnit, string> = {
  U: 'U (unidades)',
  ml: 'ml',
  seringa: 'seringa',
  fio: 'fio',
  outro: 'outro',
};

export const FACE_MAP_MAX_POINTS = 60;

export type FacePoint = {
  x: number;
  y: number;
  area: string;
  product: string;
  amount: number | null;
  unit: FaceUnit;
  note: string | null;
};

/** Desenho do rosto (o mesmo em src/components/prontuario/face-map-tab.tsx). */
export const FACE_VIEWBOX = { width: 200, height: 260 } as const;

/**
 * Região do rosto pela posição (em %). O lado é o do paciente: o direito dele fica à esquerda de
 * quem olha o desenho.
 */
export function areaAt(x: number, y: number): string {
  const side = x < 50 ? ' direito' : ' esquerdo';
  const sideF = x < 50 ? ' direita' : ' esquerda';
  if (y < 29) return 'Testa';
  if (y < 36) return x >= 44 && x <= 56 ? 'Glabela' : `Sobrancelha${sideF}`;
  if (y < 45) {
    if (x < 27 || x > 73) return `Pés de galinha${side}`;
    if (x >= 45 && x <= 55) return 'Nariz';
    return `Região dos olhos${sideF}`;
  }
  if (y < 58) return x >= 43 && x <= 57 ? 'Nariz' : `Malar (maçã do rosto)${sideF}`;
  if (y < 69) {
    if (x >= 42 && x <= 58) return 'Região perioral';
    if (x >= 28 && x <= 72) return `Sulco nasogeniano${side}`;
    return `Bochecha${sideF}`;
  }
  if (y < 78) {
    if (x >= 37 && x <= 63) return 'Lábios';
    if (x >= 30 && x <= 70) return `Linha de marionete${sideF}`;
    return `Mandíbula${sideF}`;
  }
  return x >= 38 && x <= 62 ? 'Mento (queixo)' : `Mandíbula${sideF}`;
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));

/** Confere e arruma os pontos de uma aplicação. */
export function normalizeFacePoints(raw: unknown): FacePoint[] {
  if (!Array.isArray(raw)) throw new Error('Marque os pontos no rosto.');
  if (raw.length === 0) throw new Error('Marque pelo menos um ponto no rosto.');
  if (raw.length > FACE_MAP_MAX_POINTS) {
    throw new Error(`No máximo ${FACE_MAP_MAX_POINTS} pontos por aplicação.`);
  }
  return raw.map((p, i) => {
    const point = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Ponto ${i + 1} inválido.`);
    const amountRaw = point.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || amountRaw === '' ? null : Number(amountRaw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10_000)) {
      throw new Error(`Quantidade do ponto ${i + 1} inválida.`);
    }
    const unit = (FACE_UNITS as readonly string[]).includes(String(point.unit))
      ? (point.unit as FaceUnit)
      : 'U';
    const area =
      String(point.area ?? '')
        .trim()
        .slice(0, 60) || areaAt(clamp(x), clamp(y));
    return {
      x: clamp(x),
      y: clamp(y),
      area,
      product: String(point.product ?? '')
        .trim()
        .slice(0, 80),
      amount: amount === null ? null : Math.round(amount * 100) / 100,
      unit,
      note:
        String(point.note ?? '')
          .trim()
          .slice(0, 200) || null,
    };
  });
}

/** Total por produto e unidade (ex.: "Toxina: 24 U"). Pontos sem quantidade não somam. */
export function faceMapTotals(points: Pick<FacePoint, 'product' | 'amount' | 'unit'>[]) {
  const totals = new Map<string, { product: string; unit: FaceUnit; amount: number }>();
  for (const p of points) {
    if (p.amount === null) continue;
    const product = p.product.trim() || 'Sem produto';
    const key = `${product.toLowerCase()}|${p.unit}`;
    const row = totals.get(key) ?? { product, unit: p.unit, amount: 0 };
    row.amount = Math.round((row.amount + p.amount) * 100) / 100;
    totals.set(key, row);
  }
  return [...totals.values()];
}

export function formatAmount(amount: number, unit: FaceUnit) {
  const n = amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (unit === 'U') return `${n} U`;
  if (unit === 'seringa') return `${n} ${amount === 1 ? 'seringa' : 'seringas'}`;
  if (unit === 'fio') return `${n} ${amount === 1 ? 'fio' : 'fios'}`;
  if (unit === 'outro') return n;
  return `${n} ${unit}`;
}

/** Quais recursos de prontuário o ramo ganha (odonto também faz harmonização orofacial). */
export function clinicalCharts(segment: string | null | undefined) {
  return {
    odontogram: segment === 'odonto',
    faceMap: segment === 'odonto' || segment === 'estetica' || segment === 'consultorio',
  };
}
