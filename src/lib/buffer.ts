/**
 * Intervalo de preparo/limpeza depois de um atendimento (por serviço). A duração que o cliente vê
 * não muda; só ninguém é encaixado nesse tempo. Vale entre atendimentos — bloqueios (almoço,
 * folga) continuam como eram.
 */
export const MAX_BUFFER_MINUTES = 120;

export type BufferedRange = { startAt: Date; endAt: Date; bufferMinutes?: number | null };

/** Dois atendimentos se chocam se um começa antes de o outro terminar o preparo (nos dois sentidos). */
export function clashesWithBuffer(a: BufferedRange, b: BufferedRange): boolean {
  const aEnd = a.endAt.getTime() + (a.bufferMinutes ?? 0) * 60_000;
  const bEnd = b.endAt.getTime() + (b.bufferMinutes ?? 0) * 60_000;
  return a.startAt.getTime() < bEnd && b.startAt.getTime() < aEnd;
}
