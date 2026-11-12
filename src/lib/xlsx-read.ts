/*
  Lê a primeira aba de uma planilha do Excel (.xlsx) como linhas de texto, para a importação
  aceitar o arquivo do Excel direto (sem "Salvar como CSV"). Sem dependência: o .xlsx é um zip de
  XMLs; descompacta com o DecompressionStream do navegador. Datas viram dd/mm/aaaa.
*/

const decoder = new TextDecoder();

type ZipEntry = { name: string; method: number; offset: number; size: number };

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fim do diretório central: procura de trás para frente (pode haver comentário no fim).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not-zip');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('not-zip');
    const nameLength = view.getUint16(at + 28, true);
    entries.push({
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start =
    entry.offset +
    30 +
    view.getUint16(entry.offset + 26, true) +
    view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return decoder.decode(data);
  if (entry.method !== 8) throw new Error('unsupported');
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return decoder.decode(await new Response(stream).arrayBuffer());
}

const unescapeXml = (v: string) =>
  v
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Texto de um <si> ou <is>: junta os trechos <t>, ignorando a fonética (<rPh>). */
const richText = (xml: string) =>
  unescapeXml(
    [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((m) => m[1])
      .join(''),
  );

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

/** Formatos de data embutidos do Excel e formatos próprios com dia/mês/ano. */
function dateStyles(stylesXml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    custom.set(Number(attr(m[0], 'numFmtId')), unescapeXml(attr(m[0], 'formatCode') ?? ''));
  }
  const isDateFormat = (id: number) => {
    if (
      (id >= 14 && id <= 22) ||
      (id >= 27 && id <= 36) ||
      (id >= 45 && id <= 47) ||
      (id >= 50 && id <= 58)
    )
      return true;
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(code) || /m{3,}/i.test(code) || /(^|[^h:])m+[/\-.]/i.test(code);
  };
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const result = new Set<number>();
  [...cellXfs.matchAll(/<xf\b[^>]*\/?>/g)].forEach((m, index) => {
    if (isDateFormat(Number(attr(m[0], 'numFmtId') ?? 0))) result.add(index);
  });
  return result;
}

/** Número de série do Excel → dd/mm/aaaa (base 30/12/1899). */
function serialToDate(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function columnIndex(ref: string): number {
  let index = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase())
    index = index * 26 + ch.charCodeAt(0) - 64;
  return index - 1;
}

/** Primeira aba da planilha como linhas de texto. Lança erro se não for um .xlsx legível. */
export async function readXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = new Map(zipEntries(bytes).map((e) => [e.name.replace(/^\//, ''), e]));
  const file = async (name: string) => {
    const entry = entries.get(name);
    // Alguns programas gravam as tags com prefixo (<x:row>); tira o prefixo para ler igual.
    return entry ? (await readEntry(bytes, entry)).replace(/<(\/?)[\w.-]+:/g, '<$1') : null;
  };

  const workbook = await file('xl/workbook.xml');
  if (!workbook) throw new Error('not-xlsx');
  const firstSheet = workbook.match(/<sheet\b[^>]*\/?>/)?.[0] ?? '';
  const relId = attr(firstSheet, 'r:id');
  const rels = (await file('xl/_rels/workbook.xml.rels')) ?? '';
  const target =
    [...rels.matchAll(/<Relationship\b[^>]*\/?>/g)]
      .map((m) => m[0])
      .find((r) => attr(r, 'Id') === relId)
      ?.match(/\bTarget="([^"]*)"/)?.[1] ?? 'worksheets/sheet1.xml';
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheet = await file(sheetPath);
  if (!sheet) throw new Error('not-xlsx');

  const shared = [
    ...((await file('xl/sharedStrings.xml')) ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
  ].map((m) => richText(m[1]));
  const dates = dateStyles((await file('xl/styles.xml')) ?? '');

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(attr(rowMatch[1], 'r') ?? rows.length + 1) - 1;
    const row: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const ref = attr(attrs, 'r');
      const col = ref ? columnIndex(ref) : row.length;
      const type = attr(attrs, 't');
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr')
        value = richText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
      else if (type === 'b') value = raw === '1' ? 'Sim' : raw === '0' ? 'Não' : '';
      else if (type === 'e') value = '';
      else if (type === 'str') value = unescapeXml(raw ?? '');
      else if (type === 'd') {
        // Data ISO (alguns programas gravam assim): 1982-01-03T00:00:00Z → 03/01/1982.
        const iso = (raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        value = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : unescapeXml(raw ?? '');
      } else if (raw != null && raw !== '') {
        const n = Number(raw);
        value =
          dates.has(Number(attr(attrs, 's') ?? 0)) && Number.isFinite(n) ? serialToDate(n) : raw;
      }
      row[col] = value.trim();
    }
    rows[rowIndex] = Array.from(row, (v) => v ?? '');
  }
  const dense = Array.from(rows, (r) => r ?? []);
  while (dense.length && dense[dense.length - 1].every((v) => !v)) dense.pop();
  return dense;
}

/** Linhas → CSV com ";" (o formato que a importação já lê). */
export function rowsToCsv(rows: string[][]): string {
  const quote = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(quote).join(';')).join('\r\n');
}
