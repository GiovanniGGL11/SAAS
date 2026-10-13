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
]);
export type AssistantAction = z.infer<typeof assistantActionSchema>;

/** O que a tela recebe: a ação e um resumo legível para a pessoa conferir antes de confirmar. */
export type AssistantProposal = {
  id: string;
  title: string;
  details: { label: string; value: string }[];
  action: AssistantAction;
};

export type AssistantChatMessage = { role: 'user' | 'model'; text: string };

export const assistantMessagesSchema = z
  .array(z.object({ role: z.enum(['user', 'model']), text: z.string().min(1).max(4000) }))
  .min(1)
  .max(30);
