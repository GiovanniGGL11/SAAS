/** "01310100" → "01310-100"; enquanto digita, só aplica a máscara no que já tem. */
export function formatCep(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export type CepAddress = {
  street: string;
  district: string;
  city: string;
  state: string;
};

/**
 * Consulta o ViaCEP direto do navegador (API pública, sem chave). Devolve null quando o CEP não
 * existe; falha de rede vira exceção para a tela mostrar outra mensagem.
 */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal });
  // O ViaCEP responde 400 para formato inválido e 200 com { erro: true } para CEP inexistente.
  if (response.status === 400) return null;
  if (!response.ok) throw new Error('Falha ao consultar o CEP.');
  const data = (await response.json()) as {
    erro?: boolean | string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro) return null;
  return {
    street: data.logradouro ?? '',
    district: data.bairro ?? '',
    city: data.localidade ?? '',
    state: data.uf ?? '',
  };
}

type AddressParts = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

/** Endereço numa linha, pulando o que estiver vazio: "Rua X, 10 - Ap 2 - Centro, Cidade/UF". */
export function formatAddress(a: AddressParts): string {
  const streetLine = [a.street, a.number].filter(Boolean).join(', ');
  const cityLine = [a.city, a.state].filter(Boolean).join('/');
  return [streetLine, a.complement, a.district, cityLine, a.zipCode ? formatCep(a.zipCode) : null]
    .filter(Boolean)
    .join(' - ');
}

/** Busca do Google Maps (funciona sem chave de API e abre o app no celular). */
export function mapsSearchLink(a: AddressParts): string | null {
  const query = [
    [a.street, a.number].filter(Boolean).join(', '),
    a.district,
    [a.city, a.state].filter(Boolean).join(' - '),
    a.zipCode ? formatCep(a.zipCode) : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (!a.street && !a.zipCode) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
