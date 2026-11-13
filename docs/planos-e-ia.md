# Planos, permissões e IA

Referência para quem mantém o Atendafy. Valores comerciais são **provisórios**.

## Onde mudar cada coisa

| O quê | Onde |
| --- | --- |
| Nome, preço (centavos), limites de profissionais/unidades, funcionalidades, IA incluída, adicionais, destaques da tela de planos | `src/lib/billing/plans.ts` → `PLANS` |
| Liberar a contratação de um plano pela Asaas | `checkoutEnabled` do plano (Básico, Profissional e Pro liberados) |
| Franquia mensal de IA | `ai.monthlyUnits` de cada plano: Profissional 600, Pro 1.500, teste 150 (`null` bloquearia em produção) |
| Franquia do teste grátis e plano-base do teste | `TRIAL_GRANT` |
| Valor provisório só para desenvolvimento | `DEV_PROVISIONAL_AI_UNITS` (nunca vale em produção) |
| Tolerância de atraso | `PAST_DUE_GRACE_DAYS` |
| O que de IA está construído de fato | `AI_IMPLEMENTED` (voz é ditado pelo navegador; automações com IA e WhatsApp com IA estão `false`; execução automática de rotinas autorizadas está `true`) |
| Funcionalidades de gestão por plano (orçamentos, área do cliente, convites, importação, resumo do dia, rotinas, resultados, checklist, margem, tarefas, CRM, campos personalizados, pesquisas, indicações, serviços em andamento, regras de automação, indicadores avançados) | `FeatureKey` e as matrizes `ESSENTIAL_FEATURES` / `FULL_FEATURES` / `PRO_FEATURES` em `plans.ts`; conferidas no servidor por `src/server/billing/features.ts` |
| Adicionais (WhatsApp com IA) | `ADD_ONS` |
| Preço estimado do provedor (só para estimar custo) | `AI_PROVIDER_PRICING` |
| Rotinas que podem receber execução automática | `AUTOMATABLE_TASKS` em `src/server/ai/autonomy.ts` (renovação de pacotes e lista de espera automática) |
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

## Evolução operacional (orçamentos, portal, lista de espera, aprovações, rotinas)

Detalhes por etapa, dependências e pendências: `docs/evolucao-operacional.md`.

## Gestão completa (tarefas, comercial, serviços em andamento, indicações, regras, indicadores, catálogo)

Recursos por plano, onde configurar, migrações e pendências: `docs/gestao-completa.md`.

## Custo da IA no limite (novembro de 2026)

Uma "unidade" é uma consulta ao Gemini; cada pergunta usa de 1 a 6 (≈3). Cada consulta leva ~4.000
tokens fixos (instruções + 24 ferramentas) mais a conversa: estimado 5.000–8.000 de entrada e
250–400 de saída. Dólar a R$ 5,50. O modelo é `gemini-flash-latest` (apelido: o preço muda com o
Flash mais novo).

| Cenário de preço (US$/1M entrada · saída) | Custo por consulta |
| --- | --- |
| 0,30 · 2,50 | R$ 0,012–0,019 |
| 0,75 · 3,75 (provável; promocional até 31/12/2026) | R$ 0,026–0,041 |
| 1,50 · 9,00 | R$ 0,054–0,086 |

Lucro de quem usa **tudo** (preço − R$ 1,99 da Asaas − IA; sem impostos): Profissional (R$ 79,90,
600) de R$ 26 a R$ 71; Pro (R$ 149,90, 1.500) de R$ 19 a R$ 130. Com os limites anteriores
(1.000/3.000) o Pro podia dar prejuízo no cenário caro. Fixar um modelo específico no lugar do
apelido evita mudança de preço sem aviso.

## WhatsApp automático

Adicional dos planos Profissional e Pro: o salão conecta o próprio número pela Z-API (Configurações
→ WhatsApp) e a Z-API cobra direto dele. O Atendafy não cobra pelo envio. Sem a Z-API, a mensagem
continua pronta no botão do WhatsApp (todos os planos). A API oficial da Meta (cobrança por
mensagem) ainda não está integrada.


## Travas por plano e incentivos para subir

- Do Profissional, travados no servidor (`assertFeature`) e com convite na tela (`UpgradeCard`,
  `upgradeOffer` em `src/server/billing/features.ts`): relatórios, comissões, campanhas,
  indicações, fichas, pacotes e WhatsApp automático (inclusive o envio pela rotina). Do Pro: várias
  unidades.
- O convite mostra o plano mais barato que libera o recurso e quanto custa a mais por dia
  (`buildUpgradeOffer` em `src/lib/billing/upgrade.ts`).
- Limites de profissionais: Básico 2, Profissional 3, Pro sem limite.
- No teste, a Assinatura mostra o que a empresa já usou do Profissional
  (`src/server/billing/trial-usage.ts`), com o botão para continuar nele.
