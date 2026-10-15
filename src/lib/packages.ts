/**
 * Regras puras de pacote: progresso (do livro de movimentos), situação financeira (dos
 * lançamentos ligados) e avisos. Execução e pagamento são independentes: um pacote pode estar
 * com 3 de 8 sessões feitas e totalmente pago, ou com tudo feito e metade no fiado.
 */

export type MovementKind = 'CONSUME' | 'RESTORE' | 'OPENING_DONE' | 'EXTEND' | 'ADJUST';
export type Movement = { kind: MovementKind; quantity: number };

/** Sessões realizadas segundo o livro (EXTEND amplia o total, não conta como realizada). */
export function sessionsDone(movements: Movement[]): number {
  return movements.reduce((sum, m) => (m.kind === 'EXTEND' ? sum : sum + m.quantity), 0);
}

export function progressLabel(done: number, total: number): string {
  return `${done} de ${total}`;
}

export type FinancialStatus = 'PAID' | 'PARTIAL' | 'TAB' | 'UNPAID';

export const FINANCIAL_STATUS_LABEL: Record<FinancialStatus, string> = {
  PAID: 'Pago',
  PARTIAL: 'Pago em parte',
  TAB: 'No fiado',
  UNPAID: 'A pagar',
};

/**
 * Situação financeira: pago = lançamentos pagos ligados ao pacote + valor já pago informado no
 * saldo inicial; fiado = lançamentos pendentes ligados. O que falta lançar é o restante.
 */
export function packageFinancial(params: { price: number; paid: number; pending: number }) {
  const round = (v: number) => Math.round(v * 100) / 100;
  const paid = round(params.paid);
  const pending = round(params.pending);
  const price = round(params.price);
  const unbilled = round(Math.max(price - paid - pending, 0));
  // O que está no fiado aparece à parte (`pending`); o status diz quanto já entrou.
  let status: FinancialStatus = 'UNPAID';
  if (paid >= price) status = 'PAID';
  else if (paid > 0) status = 'PARTIAL';
  else if (pending > 0) status = 'TAB';
  return { price, paid, pending, unbilled, status };
}

export type PackageAlert = 'expired' | 'exhausted' | 'expiring';

export function packageAlerts(params: {
  done: number;
  total: number;
  validUntil: Date | null;
  recurring: boolean;
  now: Date;
}): PackageAlert[] {
  const alerts: PackageAlert[] = [];
  if (params.done >= params.total) alerts.push('exhausted');
  if (!params.recurring && params.validUntil) {
    const left = params.validUntil.getTime() - params.now.getTime();
    if (left < 0) alerts.push('expired');
    else if (left < 15 * 86_400_000 && params.done < params.total) alerts.push('expiring');
  }
  return alerts;
}

export const PACKAGE_ALERT_LABEL: Record<PackageAlert, string> = {
  expired: 'Pacote vencido',
  exhausted: 'Todas as sessões realizadas',
  expiring: 'Vence em menos de 15 dias',
};

/** O pacote serve para este atendimento? Mesmo serviço, ativo, dentro da validade, com saldo. */
export function packageFitsAppointment(
  pkg: {
    serviceId: string;
    status: string;
    done: number;
    total: number;
    validUntil: Date | null;
    recurring: boolean;
  },
  serviceIds: string[],
  at: Date,
): { ok: true } | { ok: false; reason: string } {
  if (pkg.status !== 'ACTIVE') return { ok: false, reason: 'Pacote cancelado.' };
  if (!serviceIds.includes(pkg.serviceId)) return { ok: false, reason: 'Pacote de outro serviço.' };
  if (!pkg.recurring && pkg.validUntil && pkg.validUntil.getTime() < at.getTime()) {
    return { ok: false, reason: 'Pacote vencido na data do atendimento.' };
  }
  if (pkg.done >= pkg.total) return { ok: false, reason: 'Sem sessões restantes.' };
  return { ok: true };
}

/** O que o cliente declara ao assinar — o mesmo texto na tela, no banco e no PDF. */
export const SIGNATURE_STATEMENT =
  'Confirmo que recebi o atendimento descrito acima nesta data. Assinatura desenhada no ' +
  'aparelho do estabelecimento — registro interno, não é assinatura digital certificada.';
