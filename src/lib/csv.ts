/** Lê CSV com ; , ou tab (o Excel em português salva com ;), respeitando aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nome', 'name', 'cliente', 'nome completo'],
  phone: ['telefone', 'celular', 'whatsapp', 'phone', 'fone', 'tel'],
  email: ['email', 'e-mail'],
  cpf: ['cpf', 'documento'],
  birthDate: [
    'nascimento',
    'data de nascimento',
    'aniversario',
    'birthday',
    'birth date',
    'data nascimento',
  ],
};

export type ImportedClient = {
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
};

/** Planilha → clientes, reconhecendo as colunas pelos nomes usuais. Data dd/mm/aaaa vira aaaa-mm-dd. */
export function rowsToClients(rows: string[][]): {
  clients: ImportedClient[];
  missingName: boolean;
} {
  if (rows.length === 0) return { clients: [], missingName: true };
  const header = rows[0].map(normalizeHeader);
  const index = (key: string) =>
    header.findIndex((h) => HEADER_ALIASES[key].some((a) => h === a || h.startsWith(a)));
  const cols = Object.fromEntries(Object.keys(HEADER_ALIASES).map((k) => [k, index(k)]));
  if (cols.name < 0) return { clients: [], missingName: true };
  const pick = (row: string[], key: string) =>
    cols[key] >= 0 ? row[cols[key]]?.trim() || undefined : undefined;
  const clients = rows.slice(1).map((row) => {
    const birth = pick(row, 'birthDate');
    const match = birth?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return {
      name: pick(row, 'name') ?? '',
      phone: pick(row, 'phone'),
      email: pick(row, 'email'),
      cpf: pick(row, 'cpf'),
      birthDate: match
        ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
        : birth && /^\d{4}-\d{2}-\d{2}$/.test(birth)
          ? birth
          : undefined,
    };
  });
  return { clients: clients.filter((c) => c.name), missingName: false };
}
