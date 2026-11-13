import { validateBookingName, validateBookingPhone } from '@/lib/booking';
import { isValidCpf } from '@/lib/trial-identity';

/*
  Cadastro pelo link: o próprio cliente preenche a ficha. Nome e WhatsApp são sempre pedidos; os
  demais campos o negócio escolhe se pede, se são opcionais ou obrigatórios.
*/

export const SIGNUP_FIELDS = [
  { key: 'email', label: 'E-mail' },
  { key: 'birthDate', label: 'Data de nascimento' },
  { key: 'cpf', label: 'CPF' },
  { key: 'address', label: 'Endereço' },
  { key: 'notes', label: 'Observações (alergias, preferências...)' },
] as const;

export type SignupFieldKey = (typeof SIGNUP_FIELDS)[number]['key'];
export type SignupFieldMode = 'off' | 'optional' | 'required';
export type SignupConfig = Record<SignupFieldKey, SignupFieldMode>;

export const DEFAULT_SIGNUP_CONFIG: SignupConfig = {
  email: 'optional',
  birthDate: 'optional',
  cpf: 'off',
  address: 'off',
  notes: 'off',
};

/** Configuração gravada (JSON) → completa e válida; o que faltar ou vier errado usa o padrão. */
export function parseSignupConfig(raw: unknown): SignupConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const config = { ...DEFAULT_SIGNUP_CONFIG };
  for (const { key } of SIGNUP_FIELDS) {
    const mode = value[key];
    if (mode === 'off' || mode === 'optional' || mode === 'required') config[key] = mode;
  }
  return config;
}

export type SignupInput = {
  name: string;
  phone: string;
  email?: string;
  birthDate?: string;
  cpf?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  notes?: string;
};

export type SignupValues = {
  name: string;
  phone: string;
  email: string | null;
  birthDate: Date | null;
  cpf: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};

const clean = (v: string | undefined, max = 200) => (v ?? '').trim().slice(0, max) || null;

/** dd/mm/aaaa ou aaaa-mm-dd → data (meio-dia UTC, para não mudar de dia no fuso). */
function parseBirthDate(raw: string): Date | 'invalid' {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 'invalid';
  const [y, mo, d] = raw.includes('-') ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  const year = Number(y);
  const ok = date.getUTCDate() === Number(d) && year >= 1900 && date.getTime() <= Date.now();
  return ok ? date : 'invalid';
}

/**
 * Confere o que o cliente preencheu, conforme o que o negócio pede. Campo desligado é ignorado
 * mesmo que venha preenchido. Devolve os erros por campo (para mostrar no formulário).
 */
export function validateSignup(
  input: SignupInput,
  config: SignupConfig,
): { values: SignupValues; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const nameError = validateBookingName(input.name ?? '');
  if (nameError) errors.name = nameError;
  const phoneError = validateBookingPhone(input.phone ?? '');
  if (phoneError) errors.phone = phoneError;

  const want = (key: SignupFieldKey) => config[key] !== 'off';
  const need = (key: SignupFieldKey, filled: boolean, message: string) => {
    if (config[key] === 'required' && !filled) errors[key] = message;
  };

  const email = want('email') ? (clean(input.email, 160)?.toLowerCase() ?? null) : null;
  need('email', Boolean(email), 'Informe seu e-mail.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Confira o e-mail.';

  let birthDate: Date | null = null;
  const birthRaw = want('birthDate') ? clean(input.birthDate, 20) : null;
  need('birthDate', Boolean(birthRaw), 'Informe sua data de nascimento.');
  if (birthRaw) {
    const parsed = parseBirthDate(birthRaw);
    if (parsed === 'invalid') errors.birthDate = 'Confira a data de nascimento.';
    else birthDate = parsed;
  }

  const cpfDigits = want('cpf') ? (input.cpf ?? '').replace(/\D/g, '') || null : null;
  need('cpf', Boolean(cpfDigits), 'Informe seu CPF.');
  if (cpfDigits && !isValidCpf(cpfDigits)) errors.cpf = 'CPF inválido. Confira os números.';

  const address = want('address');
  const street = address ? clean(input.street) : null;
  const city = address ? clean(input.city, 120) : null;
  need('address', Boolean(street && city), 'Informe pelo menos rua e cidade.');

  const notes = want('notes') ? clean(input.notes, 1000) : null;
  need('notes', Boolean(notes), 'Preencha as observações.');

  return {
    errors,
    values: {
      name: (input.name ?? '').trim().slice(0, 120),
      phone: input.phone ?? '',
      email,
      birthDate,
      cpf: cpfDigits,
      zipCode: address ? (input.zipCode ?? '').replace(/\D/g, '').slice(0, 8) || null : null,
      street,
      number: address ? clean(input.number, 20) : null,
      complement: address ? clean(input.complement, 80) : null,
      district: address ? clean(input.district, 80) : null,
      city,
      state: address ? (clean(input.state, 2)?.toUpperCase() ?? null) : null,
      notes,
    },
  };
}
