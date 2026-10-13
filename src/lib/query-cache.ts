import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Atualizações imediatas do cache do React Query, usadas pelas abas de cadastro (Clientes,
 * Serviços, Profissionais, Estoque, Campanhas…).
 *
 * As Server Actions dessas abas não chamam mais `revalidatePath`: na versão do Next usada aqui isso
 * faz o servidor re-renderizar a página inteira dentro da resposta de cada ação. Em vez disso, a
 * tela escreve a mudança no cache na hora (otimista) ou com o item que a própria ação devolveu, e
 * o `invalidateQueries` final só confirma o que está no banco.
 */

export type Rollback = () => void;

/** Troca (ou inclui) o item pelo `id` numa lista em cache. Sem lista em cache, não faz nada. */
export function upsertInList<T extends { id: string }>(
  queryClient: QueryClient,
  key: QueryKey,
  item: T,
  position: 'start' | 'end' = 'start',
) {
  queryClient.setQueryData<T[]>(key, (list) => {
    if (!list) return list;
    return list.some((entry) => entry.id === item.id)
      ? list.map((entry) => (entry.id === item.id ? { ...entry, ...item } : entry))
      : position === 'start'
        ? [item, ...list]
        : [...list, item];
  });
}

/**
 * Aplica `update` ao dado em cache agora e devolve a função que desfaz. Cancela buscas em
 * andamento para que uma resposta velha não sobrescreva a mudança.
 */
export async function optimisticUpdate<T>(
  queryClient: QueryClient,
  key: QueryKey,
  update: (data: T) => T,
): Promise<Rollback> {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<T>(key);
  if (previous === undefined) return () => {};
  queryClient.setQueryData<T>(key, update(previous));
  return () => queryClient.setQueryData<T>(key, previous);
}

/** Atalho: muda campos de um item da lista (ex.: `active`, `isVip`). */
export function optimisticPatchItem<T extends { id: string }>(
  queryClient: QueryClient,
  key: QueryKey,
  id: string,
  patch: Partial<T>,
): Promise<Rollback> {
  return optimisticUpdate<T[]>(queryClient, key, (list) =>
    list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  );
}

/** Desfaz várias mudanças de uma vez. */
export function rollbackAll(rollbacks: (Rollback | undefined)[] | undefined) {
  rollbacks?.forEach((rollback) => rollback?.());
}
