import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Escritor de PDF simples (A4, uma coluna): quebra linhas, abre página nova quando falta espaço
 * e numera as páginas no fim. Fontes padrão do PDF (sem baixar nada); caractere fora do
 * conjunto da fonte vira "?" em vez de derrubar a exportação.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const FOOTER = 36;

const INK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.85, 0.85, 0.87);

export class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private charset!: Set<number>;

  private constructor(
    readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  static async create(title: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setProducer('Atendafy');
    doc.setCreator('Atendafy');
    const writer = new PdfWriter(
      doc,
      await doc.embedFont(StandardFonts.Helvetica),
      await doc.embedFont(StandardFonts.HelveticaBold),
    );
    writer.charset = new Set(writer.font.getCharacterSet());
    writer.addPage();
    return writer;
  }

  private get contentWidth() {
    return A4.width - MARGIN * 2;
  }

  private addPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  /** Garante espaço; se não couber, continua na próxima página. */
  ensure(space: number) {
    if (this.y - space < MARGIN + FOOTER) this.addPage();
  }

  clean(text: string): string {
    return Array.from(text.replace(/\r\n?/g, '\n').replace(/\t/g, '  '))
      .map((ch) => (ch === '\n' || this.charset.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('');
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.clean(text).split('\n')) {
      if (paragraph.trim() === '') {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // Palavra maior que a linha (link, código): quebra no meio.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    value: string,
    options: { size?: number; bold?: boolean; muted?: boolean; indent?: number; gap?: number } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const indent = options.indent ?? 0;
    const leading = size * 1.35;
    for (const line of this.wrap(value, font, size, this.contentWidth - indent)) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y + size * 0.25,
        size,
        font,
        color: options.muted ? MUTED : INK,
      });
    }
    this.y -= options.gap ?? 2;
  }

  heading(value: string, size = 14) {
    this.ensure(size * 3);
    this.y -= size * 0.6;
    this.text(value, { size, bold: true, gap: 4 });
  }

  /** "Rótulo: valor" em duas linhas curtas (rótulo cinza, valor normal). */
  field(label: string, value: string, indent = 0) {
    this.ensure(30);
    this.text(label, { size: 8.5, muted: true, indent, gap: 0 });
    this.text(value || '—', { size: 10, indent, gap: 6 });
  }

  divider() {
    this.ensure(12);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4.width - MARGIN, y: this.y },
      thickness: 0.6,
      color: LINE,
    });
    this.y -= 6;
  }

  space(points: number) {
    this.y -= points;
  }

  async png(dataUrl: string, maxWidth = 220, maxHeight = 90) {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const image = await this.doc.embedPng(Buffer.from(base64, 'base64'));
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    this.ensure(height + 8);
    this.y -= height;
    this.page.drawImage(image, { x: MARGIN, y: this.y, width, height });
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width,
      height,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    this.y -= 8;
  }

  /** Rodapé em todas as páginas ("Página 2 de 5") e os bytes do arquivo. */
  async finish(footer: string) {
    const pages = this.doc.getPages();
    const text = this.clean(footer);
    pages.forEach((page, index) => {
      const label = `Página ${index + 1} de ${pages.length}`;
      page.drawText(text, { x: MARGIN, y: MARGIN - 18, size: 7.5, font: this.font, color: MUTED });
      page.drawText(label, {
        x: A4.width - MARGIN - this.font.widthOfTextAtSize(label, 7.5),
        y: MARGIN - 18,
        size: 7.5,
        font: this.font,
        color: MUTED,
      });
    });
    return this.doc.save();
  }
}

export function formatDateTimeTz(date: Date | string | null | undefined, timezone: string) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${day} às ${time}`;
}
