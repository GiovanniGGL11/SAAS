import { describe, expect, it } from 'vitest';

import { parseCsv } from '@/lib/csv';
import {
  IMPORT_FIELDS,
  checkClientRow,
  decodeCsvBytes,
  importTemplate,
  importTemplateCsv,
  suggestMapping,
  type ImportKind,
} from '@/lib/import';
import { buildXlsx } from '@/lib/xlsx';

describe('planilha modelo e leitura do arquivo', () => {
  it.each(['clients', 'products'] as ImportKind[])(
    'o modelo de %s volta reconhecendo todas as colunas sozinho',
    (kind) => {
      const rows = parseCsv(importTemplateCsv(kind));
      expect(rows).toHaveLength(3);
      const mapping = suggestMapping(kind, rows[0]);
      for (const field of IMPORT_FIELDS[kind]) expect(mapping[field.key]).not.toBeNull();
    },
  );

  it('as linhas de exemplo de clientes são válidas', () => {
    const [header, ...rows] = parseCsv(importTemplateCsv('clients'));
    const mapping = suggestMapping('clients', header);
    for (const row of rows) expect(checkClientRow(row, mapping).errors).toEqual([]);
  });

  it('acentos certos tanto em CSV UTF-8 quanto no CSV comum do Excel (Windows-1252)', () => {
    const utf8 = new TextEncoder().encode('Nome;Cidade\nJoão;São Paulo\n');
    expect(decodeCsvBytes(utf8.buffer as ArrayBuffer)).toContain('João;São Paulo');
    // "João;São Paulo" em Windows-1252: ã = 0xE3.
    const cp1252 = Uint8Array.from([
      ...new TextEncoder().encode('Nome;Cidade\nJo'),
      0xe3,
      ...new TextEncoder().encode('o;S'),
      0xe3,
      ...new TextEncoder().encode('o Paulo\n'),
    ]);
    expect(decodeCsvBytes(cp1252.buffer as ArrayBuffer)).toContain('João;São Paulo');
  });

  it('modelo do Excel: arquivo zip com os títulos, centralizado e com a 1ª linha fixa', () => {
    const { header, rows } = importTemplate('clients');
    const bytes = buildXlsx('Clientes', header, rows);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK": é um zip
    const text = new TextDecoder().decode(bytes);
    for (const label of header) expect(text).toContain(`<t xml:space="preserve">${label}</t>`);
    expect(text).toContain('<alignment horizontal="center" vertical="center"/>');
    expect(text).toContain('state="frozen"');
  });
});
