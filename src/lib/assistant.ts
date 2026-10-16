import { z } from 'zod';

/*
  Ações que o assistente pode PROPOR. O modelo nunca escreve nada: ele devolve uma destas, a tela
  mostra um cartão e só o clique em "Confirmar" executa — validando tudo de novo no servidor.
*/

const id = z.string().min(1).max(64);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
const instant = z.iso.datetime({ offset: true });

const clientFields = {
  name: z.string().trim().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  birthDate: localDate.optional(),
  notes: z.string().max(2000).optional(),
};

export const assistantActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_client'), args: z.object(clientFields) }),
  z.object({
    kind: z.literal('update_client'),
    args: z.object({ clientId: id, ...clientFields, name: clientFields.name.optional() }),
  }),
  z.object({
    kind: z.literal('create_appointment'),
    args: z.object({
      clientId: id,
      professionalId: id,
      serviceId: id,
      startAt: instant,
      notes: z.string().max(2000).optional(),
    }),
  }),
  z.object({
    kind: z.literal('reschedule_appointment'),
    args: z.object({ appointmentId: id, startAt: instant, professionalId: id.optional() }),
  }),
  z.object({
    kind: z.literal('cancel_appointment'),
    args: z.object({ appointmentId: id, reason: z.string().max(500).optional() }),
  }),
  z.object({
    kind: z.literal('stock_entry'),
    args: z.object({
      productId: id,
      quantity: z.number().int().min(1).max(100_000),
      /** Custo unitário em centavos — só se a pessoa informou o valor. */
      unitCostCents: z.number().int().min(0).max(100_000_000).optional(),
      /** Padrão: não lançar pagamento (entrada de estoque não é pagamento). */
      payment: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('not_recorded') }),
          z.object({
            kind: z.literal('paid'),
            method: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']),
          }),
          z.object({ kind: z.literal('payable'), dueDate: localDate }),
        ])
        .optional(),
      supplier: z.string().max(120).optional(),
    }),
  }),
  z.object({
    kind: z.literal('create_form_template'),
    args: z.object({
      name: z.string().trim().min(1).max(120),
      type: z.enum(['ANAMNESIS', 'ASSESSMENT', 'SERVICE_RECORD', 'CUSTOM']),
      description: z.string().max(1000).optional(),
      schema: z.unknown(),
    }),
  }),
  z.object({
    kind: z.literal('fill_form_draft'),
    args: z.object({
      clientId: id,
      templateId: id,
      answers: z.record(z.string().max(60), z.unknown()),
    }),
  }),
]);
export type AssistantAction = z.infer<typeof assistantActionSchema>;

/** O que a tela recebe: a ação e um resumo legível para a pessoa conferir antes de confirmar. */
export type AssistantProposal = {
  /** Id da proposta guardada no servidor — a confirmação usa só isto. */
  id: string;
  title: string;
  details: { label: string; value: string }[];
  status: 'AWAITING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'EXPIRED';
  expiresAt: string;
};

export const AI_PROPOSAL_STATUS_LABEL: Record<AssistantProposal['status'], string> = {
  AWAITING_APPROVAL: 'Aguardando sua aprovação',
  EXECUTING: 'Executando…',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirou',
};

export type AssistantChatMessage = { role: 'user' | 'model'; text: string };

export const assistantMessagesSchema = z
  .array(z.object({ role: z.enum(['user', 'model']), text: z.string().min(1).max(4000) }))
  .min(1)
  .max(30);
