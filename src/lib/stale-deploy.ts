/*
  Versão nova publicada com a página aberta: as ações do servidor da página antiga deixam de
  existir ("Server Action ... was not found on the server"). Nesse caso recarrega a página uma vez,
  já na versão nova, em vez de mostrar o erro em inglês.
*/

export function isStaleDeployError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Server Action .* was not found on the server|failed-to-find-server-action/i.test(message);
}

const KEY = 'atendafy:reloaded-for-new-version';

/** Recarrega para a versão nova. Não repete se já recarregou há menos de 1 minuto (evita laço). */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Sem sessionStorage (aba privada etc.): recarrega mesmo assim.
  }
  window.location.reload();
  return true;
}
