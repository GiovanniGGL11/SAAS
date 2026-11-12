/** O pedido nem chegou ao servidor (internet caiu, conexão expirou). */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'TypeError' &&
    /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(
      error.message,
    )
  );
}

export const NETWORK_ERROR_MESSAGE =
  'Sem conexão com o servidor. Confira a internet e tente de novo.';

/**
 * Repete o pedido quando a conexão falha no caminho (até `attempts` vezes, com pausa crescente).
 * Só para ações que podem ser repetidas sem efeito duplicado. Erros do próprio servidor não
 * são repetidos.
 */
export async function withNetworkRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      if (attempt >= attempts) throw new Error(NETWORK_ERROR_MESSAGE);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}
