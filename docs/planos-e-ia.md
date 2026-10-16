# Planos, permissões e IA

Referência para quem mantém o Atendafy. Valores comerciais são **provisórios**.

## Onde mudar cada coisa

| O quê | Onde |
| --- | --- |
| Nome, preço (centavos), limites de profissionais/unidades, funcionalidades, IA incluída, adicionais, destaques da tela de planos | `src/lib/billing/plans.ts` → `PLANS` |
| Liberar a contratação de um plano pela Asaas | `checkoutEnabled` do plano (Pro está `false`: preço não publicado) |
| Franquia mensal de IA | `ai.monthlyUnits` de cada plano (`null` = a definir; **bloqueia em produção**) |
| Franquia do teste grátis e plano-base do teste | `TRIAL_GRANT` |
| Valor provisório só para desenvolvimento | `DEV_PROVISIONAL_AI_UNITS` (nunca vale em produção) |
| Tolerância de atraso | `PAST_DUE_GRACE_DAYS` |
| O que de IA está construído de fato | `AI_IMPLEMENTED` (voz, automações, execução automática e WhatsApp com IA estão `false`) |
| Adicionais (WhatsApp com IA) | `ADD_ONS` |
| Preço estimado do provedor (só para estimar custo) | `AI_PROVIDER_PRICING` |
| Rotinas que podem receber execução automática | `AUTOMATABLE_TASKS` em `src/server/ai/autonomy.ts` (vazio hoje) |
| Categorias sensíveis (nunca automáticas) | `SENSITIVE_CATEGORIES` em `src/server/ai/autonomy.ts` |

A tela de planos, a página de assinatura, o assistente e as validações do servidor leem dessas mesmas constantes.

## Como o acesso é decidido

`resolveEntitlements` (`src/lib/billing/entitlements.ts`) combina, sem misturar:

1. **Plano contratado** (o que está incluído).
2. **Situação da assinatura**: teste (concessão temporária explícita), ativa, cancelada dentro do período pago, atrasada (tolerância: uso manual continua, IA pausa).
3. **Implementado** (`AI_IMPLEMENTED`).
4. **Franquia definida**.

Permissão da pessoa (papel e permissões de fichas), saldo do mês e aprovação de cada ação são conferidos à parte no servidor (`src/server/ai/*`).

## Identificadores e o plano Rede

- `essencial` = **Básico** (id antigo preservado), `profissional` = **Profissional**, `pro` = **Pro** (novo).
- `rede` é plano **antigo**: continua válido para quem já assina, não é oferecido a contas novas e **não vira Pro automaticamente**. Mantém profissionais ilimitados e várias unidades; a IA fica no nível do Profissional (com aprovação, sem execução automática). Migrar quem tem Rede para Pro é decisão comercial.

## Ciclo de assinatura

- Acesso começa: no teste (dias em `TRIAL_DAYS`) ou com a assinatura ativa.
- Cancelamento: vale até `currentPeriodEnd`.
- Atraso: até `currentPeriodEnd` tudo vale; depois, `PAST_DUE_GRACE_DAYS` com uso manual e IA pausada; depois, sem acesso pago.
- Teste com o Básico escolhido: sem IA.
- Downgrade: novas chamadas de IA bloqueadas na hora; propostas pendentes são revalidadas e recusadas; modo automático cai para "Pedir aprovação" (configuração guardada); nenhum dado é apagado. Reativação não executa fila antiga (propostas expiram em 30 min; tarefas automáticas antigas são recusadas por idade).

## IA: execução segura

- Proposta guardada no servidor (`AiActionProposal`), confirmada só pelo id, uma vez (passagem atômica para `EXECUTING`); se a prévia mudar, pede nova aprovação.
- Franquia com reserva antes da chamada e conciliação depois (`AiUsageReservation`, `AiUsagePeriod`), sob trava por empresa e mês.
- Medição (`AiUsageEvent`): provedor, modelo, tokens, chamadas, custo estimado — sem conteúdo.
- Rascunhos de ficha preenchidos pela IA têm o conteúdo apagado da proposta ao encerrar.

## Pendências comerciais

Preços definitivos, franquias por plano e do teste, liberação da contratação do Pro, preço e limites do adicional de WhatsApp com IA, e o destino dos assinantes do Rede.
