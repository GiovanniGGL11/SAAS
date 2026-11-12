/*
  PIX copia e cola (BR Code estático, Manual de Padrões para Iniciação do Pix do Banco Central).
  Gera o código com a chave do negócio e o valor; o dinheiro cai direto no banco dele. Não há como
  saber sozinho se foi pago: quem confirma é o negócio.
*/

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const PIX_KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'PHONE', label: 'Celular' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'EVP', label: 'Aleatória' },
];

/** Deixa a chave no formato do DICT; `null` quando não é uma chave válida do tipo. */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const value = raw.trim();
  const digits = value.replace(/\D/g, '');
  switch (type) {
    case 'CPF':
      return digits.length === 11 ? digits : null;
    case 'CNPJ':
      return digits.length === 14 ? digits : null;
    case 'PHONE': {
      const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
      return national.length === 10 || national.length === 11 ? `+55${national}` : null;
    }
    case 'EMAIL':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 77
        ? value.toLowerCase()
        : null;
    case 'EVP':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ? value.toLowerCase()
        : null;
  }
}

/** Nome e cidade no BR Code: sem acento, só caracteres simples, no tamanho máximo do campo. */
function plain(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const field = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixPayload(input: {
  key: string;
  name: string;
  city: string;
  /** Sem valor, quem paga digita. */
  amount?: number;
  /** Identificador que aparece no extrato (até 25 letras/números); "***" se vazio. */
  txid?: string;
}): string {
  const txid = (input.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const payload =
    field('00', '01') +
    field('26', field('00', 'br.gov.bcb.pix') + field('01', input.key)) +
    field('52', '0000') +
    field('53', '986') +
    (input.amount !== undefined ? field('54', input.amount.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', plain(input.name, 25) || 'RECEBEDOR') +
    field('60', plain(input.city, 15) || 'BRASIL') +
    field('62', field('05', txid)) +
    '6304';
  return payload + crc16(payload);
}
