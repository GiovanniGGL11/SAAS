import { normalizePhone } from '@/lib/phone';

/*
  Importação assistida — regras puras (sem banco). Processamento convencional: reconhece colunas
  pelos nomes usuais, valida linha a linha e aponta duplicados por chave exata (telefone, e-mail,
  CPF, código ou nome idêntico). Nunca junta registros por nome "parecido". O conteúdo do
  arquivo é DADO: nada nele é interpretado como comando.
*/

export const IMPORT_LIMITS = {
  /** Corpo da Server Action tem 1 MB; o arquivo fica abaixo disso. */
  maxBytes: 900_000,
  maxRows: 5000,
  maxColumns: 60,
  previewRows: 30,
} as const;

export type ImportKind = 'clients' | 'products';
export type DuplicateMode = 'skip' | 'fill_empty';

export type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] };

export const IMPORT_FIELDS: Record<ImportKind, FieldDef[]> = {
  clients: [
    {
      key: 'name',
      label: 'Nome',
      required: true,
      aliases: ['nome', 'name', 'cliente', 'nome completo'],
    },
    {
      key: 'phone',
      label: 'Telefone',
      aliases: ['telefone', 'celular', 'whatsapp', 'phone', 'fone', 'tel'],
    },
    { key: 'email', label: 'E-mail', aliases: ['email', 'e-mail', 'mail'] },
    { key: 'cpf', label: 'CPF', aliases: ['cpf', 'documento'] },
    {
      key: 'birthDate',
      label: 'Nascimento',
      aliases: ['nascimento', 'data de nascimento', 'aniversario', 'birthday', 'data nascimento'],
    },
    {
      key: 'notes',
      label: 'Observações',
      aliases: ['observacoes', 'observacao', 'obs', 'notas', 'notes'],
    },
    { key: 'zipCode', label: 'CEP', aliases: ['cep'] },
    { key: 'street', label: 'Rua', aliases: ['rua', 'logradouro', 'endereco', 'address'] },
    { key: 'number', label: 'Número', aliases: ['numero', 'num'] },
    { key: 'district', label: 'Bairro', aliases: ['bairro'] },
    { key: 'city', label: 'Cidade', aliases: ['cidade', 'municipio'] },
    { key: 'state', label: 'UF', aliases: ['uf', 'estado'] },
  ],
  products: [
    {
      key: 'name',
      label: 'Nome',
      required: true,
      aliases: ['nome', 'produto', 'name', 'descricao do produto'],
    },
    { key: 'sku', label: 'Código', aliases: ['codigo', 'sku', 'cod', 'referencia', 'ref'] },
    {
      key: 'costPrice',
      label: 'Custo',
      aliases: ['custo', 'preco de custo', 'valor de custo', 'cost'],
    },
    {
      key: 'salePrice',
      label: 'Preço de venda',
      aliases: ['preco', 'preco de venda', 'valor', 'venda', 'price'],
    },
    {
      key: 'quantity',
      label: 'Quantidade',
      aliases: ['quantidade', 'qtd', 'estoque', 'saldo', 'quantity'],
    },
    {
      key: 'minQuantity',
      label: 'Estoque mínimo',
      aliases: ['minimo', 'estoque minimo', 'qtd minima', 'min'],
    },
    { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'obs'] },
  ],
};

export type Mapping = Record<string, number | null>;

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sugestão de mapeamento: nome igual primeiro, depois "começa com". Uma coluna por campo. */
export function suggestMapping(kind: ImportKind, header: string[]): Mapping {
  const normalized = header.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const field of IMPORT_FIELDS[kind]) {
    // Apelidos passam pela mesma normalização do cabeçalho ("E-mail" e "e-mail" viram "e mail").
    const aliases = field.aliases.map(normalizeHeader);
    let index = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    if (index < 0) {
      index = normalized.findIndex(
        (h, i) => !used.has(i) && aliases.some((a) => h.startsWith(`${a} `)),
      );
    }
    mapping[field.key] = index >= 0 ? index : null;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

function parseMoney(raw: string | undefined): number | null | 'invalid' {
  if (!raw?.trim()) return null;
  const cleaned = raw.replace(/r\$\s*/i, '').trim();
  // 1.234,56 (BR) ou 1234.56
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000
    ? Math.round(value * 100) / 100
    : 'invalid';
}

function parseInteger(raw: string | undefined): number | null | 'invalid' {
  if (!raw?.trim()) return null;
  const value = Number(raw.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : 'invalid';
}

function parseDate(raw: string | undefined): string | null | 'invalid' {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!parts) return 'invalid';
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  // 31/02 não vira 03/03: a data precisa existir de verdade.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'invalid';
  if (date > new Date() || y < 1900) return 'invalid';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Texto do arquivo: corta espaços, limita tamanho e remove o "=" de fórmula no início. */
function text(raw: string | undefined, max: number): string | null {
  const value =
    raw
      ?.trim()
      .replace(/^[=+@\t\r]+/, '')
      .slice(0, max) ?? '';
  return value || null;
}

export type ClientRowValue = {
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birthDate: string | null;
  notes: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export type ProductRowValue = {
  name: string;
  sku: string | null;
  costPrice: number | null;
  salePrice: number | null;
  quantity: number | null;
  minQuantity: number | null;
  description: string | null;
};

export type RowCheck<T> = { value: T | null; errors: string[] };

const cell = (row: string[], mapping: Mapping, key: string) =>
  mapping[key] != null ? row[mapping[key]!] : undefined;

export function checkClientRow(row: string[], mapping: Mapping): RowCheck<ClientRowValue> {
  const errors: string[] = [];
  const name = text(cell(row, mapping, 'name'), 200);
  if (!name) errors.push('Sem nome.');
  const rawPhone = cell(row, mapping, 'phone')?.trim();
  const digits = rawPhone ? normalizePhone(rawPhone) : undefined;
  const phone = digits && digits.length >= 10 && digits.length <= 13 ? digits : null;
  if (rawPhone && !phone) errors.push('Telefone inválido (use DDD + número).');
  const rawEmail = cell(row, mapping, 'email')?.trim().toLowerCase();
  const email =
    rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.slice(0, 200) : null;
  if (rawEmail && !email) errors.push('E-mail inválido.');
  const rawCpf = cell(row, mapping, 'cpf')?.replace(/\D/g, '');
  const cpf = rawCpf ? (rawCpf.length === 11 ? rawCpf : null) : null;
  if (rawCpf && !cpf) errors.push('CPF deve ter 11 dígitos.');
  const birth = parseDate(cell(row, mapping, 'birthDate'));
  if (birth === 'invalid') errors.push('Data de nascimento inválida (use dd/mm/aaaa).');
  const state = text(cell(row, mapping, 'state'), 2)?.toUpperCase() ?? null;
  if (errors.length) return { value: null, errors };
  return {
    value: {
      name: name!,
      phone,
      email,
      cpf,
      birthDate: birth === 'invalid' ? null : birth,
      notes: text(cell(row, mapping, 'notes'), 2000),
      zipCode: cell(row, mapping, 'zipCode')?.replace(/\D/g, '').slice(0, 8) || null,
      street: text(cell(row, mapping, 'street'), 200),
      number: text(cell(row, mapping, 'number'), 20),
      district: text(cell(row, mapping, 'district'), 100),
      city: text(cell(row, mapping, 'city'), 100),
      state,
    },
    errors,
  };
}

export function checkProductRow(row: string[], mapping: Mapping): RowCheck<ProductRowValue> {
  const errors: string[] = [];
  const name = text(cell(row, mapping, 'name'), 200);
  if (!name) errors.push('Sem nome.');
  const cost = parseMoney(cell(row, mapping, 'costPrice'));
  const sale = parseMoney(cell(row, mapping, 'salePrice'));
  const quantity = parseInteger(cell(row, mapping, 'quantity'));
  const min = parseInteger(cell(row, mapping, 'minQuantity'));
  if (cost === 'invalid') errors.push('Custo inválido.');
  if (sale === 'invalid') errors.push('Preço de venda inválido.');
  if (quantity === 'invalid') errors.push('Quantidade deve ser um número inteiro.');
  if (min === 'invalid') errors.push('Estoque mínimo deve ser um número inteiro.');
  if (errors.length) return { value: null, errors };
  return {
    value: {
      name: name!,
      sku: text(cell(row, mapping, 'sku'), 60),
      costPrice: cost as number | null,
      salePrice: sale as number | null,
      quantity: quantity as number | null,
      minQuantity: min as number | null,
      description: text(cell(row, mapping, 'description'), 1000),
    },
    errors,
  };
}

/** Nome comparável (só para achar nome IDÊNTICO; nunca para juntar nomes parecidos). */
export function sameName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Célula de CSV exportado sem risco de fórmula: texto que começa com = + - @ ganha um apóstrofo
 * (números negativos continuam números).
 */
export function csvSafe(value: string): string {
  if (/^-?\d[\d.,]*$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
