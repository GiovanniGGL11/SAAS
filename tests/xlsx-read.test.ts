import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { importTemplate } from '@/lib/import';
import { buildXlsx } from '@/lib/xlsx';
import { readXlsxRows, rowsToCsv } from '@/lib/xlsx-read';
import { NETWORK_ERROR_MESSAGE, withNetworkRetry } from '@/lib/network-retry';

/** Zip compactado (deflate), como o Excel grava — para testar o leitor fora do nosso gerador. */
function deflatedZip(files: Record<string, string>): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, centralBytes, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

const NS = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

describe('importação aceita a planilha do Excel (.xlsx)', () => {
  it('lê o próprio modelo de volta, igual', async () => {
    const { header, rows } = importTemplate('clients');
    const bytes = buildXlsx('Clientes', header, rows);
    const read = await readXlsxRows(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer,
    );
    expect(read).toEqual([header, ...rows]);
  });

  it('planilha compactada, com prefixo nas tags, textos compartilhados e datas', async () => {
    const buffer = deflatedZip({
      'xl/workbook.xml': `<x:workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="Clientes" sheetId="1" r:id="rA"/></x:sheets></x:workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rA" Type="worksheet" Target="/xl/worksheets/folha.xml"/></Relationships>',
      'xl/sharedStrings.xml': `<x:sst ${NS}><x:si><x:t>Nome</x:t></x:si><x:si><x:t>Nascimento</x:t></x:si><x:si><x:r><x:t>Jo</x:t></x:r><x:r><x:t>ão &amp; Cia</x:t></x:r></x:si></x:sst>`,
      'xl/styles.xml': `<x:styleSheet ${NS}><x:numFmts><x:numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></x:numFmts><x:cellXfs><x:xf numFmtId="0"/><x:xf numFmtId="164"/><x:xf numFmtId="14"/></x:cellXfs></x:styleSheet>`,
      'xl/worksheets/folha.xml': `<x:worksheet ${NS}><x:sheetData>
        <x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>Telefone</x:t></x:is></x:c></x:row>
        <x:row r="2"><x:c r="A2" t="s"><x:v>2</x:v></x:c><x:c r="B2" s="1"><x:v>30319</x:v></x:c><x:c r="C2"><x:v>11912345678</x:v></x:c></x:row>
        <x:row r="4"><x:c r="A4" t="inlineStr"><x:is><x:t>Ana</x:t></x:is></x:c><x:c r="B4" t="d"><x:v>1990-03-15T00:00:00Z</x:v></x:c></x:row>
        <x:row r="5"><x:c r="A5" s="2"/></x:row>
      </x:sheetData></x:worksheet>`,
    });
    const rows = await readXlsxRows(buffer);
    expect(rows).toEqual([
      ['Nome', 'Nascimento', 'Telefone'],
      ['João & Cia', '03/01/1983', '11912345678'],
      [],
      ['Ana', '15/03/1990'],
    ]);
    expect(rowsToCsv([['a;b', 'c"d']])).toBe('"a;b";"c""d"');
  });

  it('arquivo que não é planilha é recusado', async () => {
    await expect(readXlsxRows(new TextEncoder().encode('nome;telefone').buffer)).rejects.toThrow();
  });
});

describe('conexão que cai no caminho', () => {
  const offline = () => Object.assign(new TypeError('Failed to fetch'));

  it('tenta de novo e segue quando volta', async () => {
    let calls = 0;
    const result = await withNetworkRetry(async () => {
      calls += 1;
      if (calls === 1) throw offline();
      return 'ok';
    });
    expect([result, calls]).toEqual(['ok', 2]);
  });

  it('desiste com mensagem clara; erro do servidor não é repetido', async () => {
    let calls = 0;
    await expect(
      withNetworkRetry(async () => {
        calls += 1;
        throw offline();
      }, 2),
    ).rejects.toThrow(NETWORK_ERROR_MESSAGE);
    expect(calls).toBe(2);
    calls = 0;
    await expect(
      withNetworkRetry(async () => {
        calls += 1;
        throw new Error('CPF inválido');
      }),
    ).rejects.toThrow('CPF inválido');
    expect(calls).toBe(1);
  });
}, 20_000);
