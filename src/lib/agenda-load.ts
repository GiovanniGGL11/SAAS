/** Faixa do expediente em minutos desde a meia-noite. */
type Range = { startMinutes: number; endMinutes: number };

export type DayLoad = {
  /** Agendamentos do dia (sem cancelados e faltas). */
  count: number;
  /** Quanto do expediente do dia está marcado (0–100); null = sem expediente nesse dia. */
  occupancy: number | null;
  /** Trabalha no dia: tem expediente, tem agendamento ou não tem expediente cadastrado. */
  works: boolean;
};

/** Ocupação de um profissional num dia, para o cabeçalho e os filtros da visão Dia. */
export function professionalDayLoad(params: {
  appointments: { startAt: Date; endAt: Date; status: string }[];
  /** Expediente semanal do profissional; undefined = nunca cadastrado. */
  schedule: { weekday: number; range: Range }[] | undefined;
  weekday: number;
}): DayLoad {
  const active = params.appointments.filter(
    (a) => a.status !== 'CANCELED' && a.status !== 'NO_SHOW',
  );
  const openMinutes = (params.schedule ?? [])
    .filter((a) => a.weekday === params.weekday)
    .reduce((sum, a) => sum + Math.max(0, a.range.endMinutes - a.range.startMinutes), 0);
  const bookedMinutes = active.reduce(
    (sum, a) => sum + Math.max(0, (a.endAt.getTime() - a.startAt.getTime()) / 60_000),
    0,
  );
  return {
    count: active.length,
    occupancy:
      openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : null,
    works: !params.schedule || openMinutes > 0 || active.length > 0,
  };
}
