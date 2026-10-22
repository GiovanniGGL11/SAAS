/*
  Campos personalizados — regras puras. O id do campo e o id de cada opção são estáveis: renomear
  não mexe nas respostas; o tipo nunca muda depois de criado; opção removida é arquivada (a
  resposta antiga continua legível).
*/

export const CUSTOM_FIELD_ENTITIES = ['client', 'service', 'opportunity'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const ENTITY_LABEL: Record<CustomFieldEntity, string> = {
  client: 'Clientes',
  service: 'Serviços',
  opportunity: 'Oportunidades',
};

export const CUSTOM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'date',
  'boolean',
  'single_select',
  'multi_select',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const TYPE_LABEL: Record<CustomFieldType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  number: 'Número',
  date: 'Data',
  boolean: 'Sim ou não',
  single_select: 'Seleção única',
  multi_select: 'Seleção múltipla',
};

export type FieldOption = { id: string; label: string; archived?: boolean };

export type FieldDefinition = {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: FieldOption[];
};

export const isSelect = (type: CustomFieldType) =>
  type === 'single_select' || type === 'multi_select';

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Valida e normaliza um valor. Devolve `{ value: null }` para "sem resposta". Seleções só aceitam
 * opções ativas do próprio campo (a resposta antiga com opção arquivada continua salva, mas não
 * pode ser escolhida de novo).
 */
export function normalizeValue(
  field: FieldDefinition,
  raw: unknown,
  previous?: unknown,
): { value: unknown } | { error: string } {
  if (isEmpty(raw)) {
    return field.required ? { error: `Preencha "${field.label}".` } : { value: null };
  }
  const active = new Set(field.options.filter((o) => !o.archived).map((o) => o.id));
  const kept = new Set(
    (Array.isArray(previous) ? previous : previous ? [previous] : []).filter(
      (v): v is string => typeof v === 'string',
    ),
  );
  const allowed = (id: unknown) => typeof id === 'string' && (active.has(id) || kept.has(id));
  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof raw !== 'string') return { error: `"${field.label}" precisa ser texto.` };
      const max = field.type === 'short_text' ? 200 : 4000;
      const text = raw.trim();
      if (text.length > max) return { error: `"${field.label}" passa de ${max} caracteres.` };
      return text
        ? { value: text }
        : field.required
          ? { error: `Preencha "${field.label}".` }
          : { value: null };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n) || Math.abs(n) > 1e12)
        return { error: `"${field.label}" precisa ser um número.` };
      return { value: n };
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { error: `"${field.label}" precisa ser uma data.` };
      }
      const [y, m, d] = raw.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
        return { error: `"${field.label}": data inválida.` };
      return { value: raw };
    }
    case 'boolean':
      if (typeof raw !== 'boolean') return { error: `"${field.label}" precisa ser sim ou não.` };
      return { value: raw };
    case 'single_select':
      if (!allowed(raw)) return { error: `"${field.label}": opção inválida.` };
      return { value: raw };
    case 'multi_select': {
      if (!Array.isArray(raw) || raw.length > 50 || !raw.every(allowed)) {
        return { error: `"${field.label}": opções inválidas.` };
      }
      const unique = [...new Set(raw as string[])];
      return unique.length
        ? { value: unique }
        : field.required
          ? { error: `Preencha "${field.label}".` }
          : { value: null };
    }
  }
}

/** Texto legível de um valor (para listas e linha do tempo). */
export function displayValue(field: FieldDefinition, value: unknown): string {
  if (isEmpty(value)) return '—';
  const label = (id: unknown) =>
    field.options.find((o) => o.id === id)?.label ?? '(opção removida)';
  switch (field.type) {
    case 'boolean':
      return value ? 'Sim' : 'Não';
    case 'date': {
      const [y, m, d] = String(value).split('-');
      return `${d}/${m}/${y}`;
    }
    case 'single_select':
      return label(value);
    case 'multi_select':
      return (value as unknown[]).map(label).join(', ');
    case 'number':
      return Number(value).toLocaleString('pt-BR');
    default:
      return String(value);
  }
}

/**
 * Filtro de lista por um campo personalizado. "filled"/"empty" valem para qualquer tipo; os demais
 * dependem do tipo do campo (texto contém, sim/não, opção, faixa de número ou de data).
 */
export type FieldFilter =
  | { kind: 'filled' }
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'option'; optionId: string }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'date'; from?: string; to?: string };

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** A resposta guardada atende ao filtro? ("empty" é tratado por quem chama: é a ausência.) */
export function matchesFieldFilter(
  field: FieldDefinition,
  value: unknown,
  filter: FieldFilter,
): boolean {
  if (filter.kind === 'empty') return isEmpty(value);
  if (isEmpty(value)) return false;
  switch (filter.kind) {
    case 'filled':
      return true;
    case 'text':
      return (
        (field.type === 'short_text' || field.type === 'long_text') &&
        fold(String(value)).includes(fold(filter.text.trim()))
      );
    case 'boolean':
      return field.type === 'boolean' && value === filter.value;
    case 'option':
      return field.type === 'multi_select'
        ? Array.isArray(value) && value.includes(filter.optionId)
        : field.type === 'single_select' && value === filter.optionId;
    case 'number': {
      if (field.type !== 'number') return false;
      const n = Number(value);
      return (
        (filter.min === undefined || n >= filter.min) &&
        (filter.max === undefined || n <= filter.max)
      );
    }
    case 'date': {
      if (field.type !== 'date') return false;
      const d = String(value);
      return (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to);
    }
  }
}
