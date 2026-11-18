/*
  Odontograma (prontuário de odonto). Numeração FDI: o primeiro dígito é o quadrante (1–4
  permanentes, 5–8 de leite) e o segundo, o dente a partir do meio. Cada marcação vale para o dente
  inteiro ou para faces dele. Cores do padrão brasileiro: vermelho = a fazer; azul = feito ou já
  existente.
*/

export const UPPER_PERMANENT = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_PERMANENT = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const UPPER_DECIDUOUS = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const LOWER_DECIDUOUS = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const ALL_TEETH = new Set([
  ...UPPER_PERMANENT,
  ...LOWER_PERMANENT,
  ...UPPER_DECIDUOUS,
  ...LOWER_DECIDUOUS,
]);

export function isValidTooth(tooth: number): boolean {
  return ALL_TEETH.has(tooth);
}

const PERMANENT_NAMES = [
  'Incisivo central',
  'Incisivo lateral',
  'Canino',
  '1º pré-molar',
  '2º pré-molar',
  '1º molar',
  '2º molar',
  '3º molar (siso)',
];
const DECIDUOUS_NAMES = ['Incisivo central', 'Incisivo lateral', 'Canino', '1º molar', '2º molar'];
const QUADRANT_SIDE: Record<number, string> = {
  1: 'superior direito',
  2: 'superior esquerdo',
  3: 'inferior esquerdo',
  4: 'inferior direito',
};

/** Ex.: 36 → "1º molar inferior esquerdo"; 51 → "Incisivo central superior direito (de leite)". */
export function toothName(tooth: number): string {
  if (!isValidTooth(tooth)) return `Dente ${tooth}`;
  const quadrant = Math.floor(tooth / 10);
  const index = (tooth % 10) - 1;
  const deciduous = quadrant >= 5;
  const side = QUADRANT_SIDE[deciduous ? quadrant - 4 : quadrant];
  const name = (deciduous ? DECIDUOUS_NAMES : PERMANENT_NAMES)[index];
  return `${name} ${side}${deciduous ? ' (de leite)' : ''}`;
}

export const TOOTH_FACES = ['M', 'D', 'O', 'V', 'L'] as const;
export type ToothFace = (typeof TOOTH_FACES)[number];
export const FACE_LABEL: Record<ToothFace, string> = {
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal / incisal',
  V: 'Vestibular',
  L: 'Lingual / palatina',
};

/**
 * Onde cada face aparece no desenho do dente. Os dentes do lado direito do paciente ficam à
 * esquerda do odontograma: neles a mesial (virada para o meio) fica à direita do quadradinho.
 * Na arcada de cima a vestibular fica no alto; na de baixo, embaixo.
 */
export function faceLayout(tooth: number): {
  top: ToothFace;
  bottom: ToothFace;
  left: ToothFace;
  right: ToothFace;
} {
  const quadrant = Math.floor(tooth / 10);
  const patientRight = [1, 4, 5, 8].includes(quadrant);
  const upper = [1, 2, 5, 6].includes(quadrant);
  return {
    top: upper ? 'V' : 'L',
    bottom: upper ? 'L' : 'V',
    left: patientRight ? 'D' : 'M',
    right: patientRight ? 'M' : 'D',
  };
}

export type ToothCondition = {
  key: string;
  label: string;
  /** Sigla que aparece embaixo do dente nas marcações do dente inteiro. */
  short: string;
  /** "faces": escolhe as faces; "tooth": vale para o dente inteiro. */
  scope: 'faces' | 'tooth';
};

export const TOOTH_CONDITIONS: ToothCondition[] = [
  { key: 'carie', label: 'Cárie', short: 'CA', scope: 'faces' },
  { key: 'restauracao', label: 'Restauração', short: 'RE', scope: 'faces' },
  { key: 'selante', label: 'Selante', short: 'SE', scope: 'faces' },
  { key: 'canal', label: 'Tratamento de canal', short: 'TC', scope: 'tooth' },
  { key: 'coroa', label: 'Coroa / prótese fixa', short: 'CO', scope: 'tooth' },
  { key: 'implante', label: 'Implante', short: 'IM', scope: 'tooth' },
  { key: 'extracao', label: 'Extração', short: 'EX', scope: 'tooth' },
  { key: 'ausente', label: 'Ausente', short: 'AU', scope: 'tooth' },
  { key: 'fratura', label: 'Fratura', short: 'FR', scope: 'tooth' },
  { key: 'outro', label: 'Outro', short: 'OU', scope: 'tooth' },
];

export function conditionOf(key: string): ToothCondition | undefined {
  return TOOTH_CONDITIONS.find((c) => c.key === key);
}

export const TOOTH_STATUSES = ['planned', 'done'] as const;
export type ToothStatus = (typeof TOOTH_STATUSES)[number];
export const STATUS_LABEL: Record<ToothStatus, string> = {
  planned: 'A fazer',
  done: 'Feito / existente',
};

export type ToothMarkInput = {
  tooth: number;
  faces: string[];
  condition: string;
  status: string;
  note?: string | null;
};

/** Confere e arruma a marcação (faces na ordem, sem repetir; nota curta). */
export function normalizeToothMark(input: ToothMarkInput) {
  if (!isValidTooth(input.tooth)) throw new Error('Dente inválido.');
  const condition = conditionOf(input.condition);
  if (!condition) throw new Error('Escolha o que há no dente.');
  if (!(TOOTH_STATUSES as readonly string[]).includes(input.status)) {
    throw new Error('Escolha se está a fazer ou feito.');
  }
  const faces =
    condition.scope === 'faces'
      ? TOOTH_FACES.filter((f) => input.faces.includes(f))
      : ([] as ToothFace[]);
  if (condition.scope === 'faces' && faces.length === 0) {
    throw new Error(`Marque as faces da ${condition.label.toLowerCase()}.`);
  }
  const note = input.note?.trim().slice(0, 300) || null;
  return {
    tooth: input.tooth,
    faces,
    condition: condition.key,
    status: input.status as ToothStatus,
    note,
  };
}

/** Texto curto de uma marcação: "36 · Cárie (O, M) · a fazer". */
export function describeToothMark(mark: {
  tooth: number;
  faces: string[];
  condition: string;
  status: string;
}) {
  const condition = conditionOf(mark.condition)?.label ?? mark.condition;
  const faces = mark.faces.length ? ` (${mark.faces.join(', ')})` : '';
  const status = mark.status === 'planned' ? 'a fazer' : 'feito';
  return `${mark.tooth} · ${condition}${faces} · ${status}`;
}
