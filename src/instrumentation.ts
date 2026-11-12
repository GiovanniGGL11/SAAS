import type { Instrumentation } from 'next';

/**
 * Guarda os erros do servidor na tabela ServerErrorLog: o código que o usuário vê ("ERROR 123…")
 * é o `digest`, e com ele dá para achar a mensagem e o stack sem acesso aos logs da hospedagem.
 * Não guarda cabeçalhos (cookies) nem query string. Falhar ao gravar nunca derruba nada.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : null;
    const { prisma } = await import('@/lib/db');
    await prisma.serverErrorLog.create({
      data: {
        digest,
        message: error.message.slice(0, 2000),
        stack: error.stack?.slice(0, 8000) ?? null,
        method: request.method,
        path: request.path.split('?')[0].slice(0, 500),
        routePath: context.routePath ?? null,
        routeType: context.routeType ?? null,
      },
    });
  } catch {
    // Sem banco não há onde registrar; o erro original segue o fluxo normal do Next.
  }
};
