/** Lado do cliente de `toActionResult`: devolve o dado ou lança com a mensagem do servidor. */
export function unwrapResult<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
