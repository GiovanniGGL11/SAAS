# Evolução operacional — orçamentos, portal, lista de espera, aprovações e rotinas

Referência para quem mantém o Atendafy. Cada recurso confere o plano **no servidor**
(`src/server/billing/features.ts`, matriz em `src/lib/billing/plans.ts`); esconder botão nunca é a
proteção. Cinco coisas nunca se misturam: direito do plano · disponibilidade técnica (integração)
· permissão da pessoa · saldo de IA · autorização para executar.

## Migrações (todas aditivas, já aplicadas no banco compartilhado)

| Migração | O que cria |
| --- | --- |
| `20261019120000_quotes_tasks_waitlist_offers` | `Quote`, `QuoteVersion`, `Task`, `WaitlistOffer`; preferências na `WaitlistEntry` (profissionais aceitos, dias, faixa, validade, canal; `desiredDate` passou a opcional); `Service.checklistItems`, `Appointment.checklistChecked`, `FormEntry.releasedToClientAt`; status `EXPIRED` da lista |
| `20261019140000_preferences_imports_automations` | `BusinessPreferences`, `ImportBatch`, `AutomationRun`, `DailySummary`; `AiActionProposal.decidedByUserId/decisionNote`; status `REJECTED` das propostas |

## ETAPA 1

**Visão do atendimento** — `/agenda/atendimento/[id]` (link "Abrir visão do atendimento" no painel
da agenda). Cliente, serviço, profissional, horário, status, pacote (sessões feitas/restantes,
validade, avisos), fichas exigidas, registro da sessão (evolução e assinatura), checklist do serviço,
materiais previstos e movimentados, atendimento anterior, pendências financeiras, próximo
agendamento e orçamentos em aberto.
- Reaproveita: fichas (`AppointmentForms`), registro da sessão/assinatura, comanda (`CheckoutForm`),
  status rápidos, pacotes (`getClientPackagesDetail`), consumo de materiais (`ServiceSupply`).
- Regras: agendar não consome sessão; a baixa acontece uma vez, ao concluir pela comanda (regra já
  existente). Clínico (atendimento anterior) exige permissão de **ler fichas**; financeiro, só
  **administrador** — conferidos separadamente no servidor.
- Material extra registrado ali sai do estoque e não volta se o atendimento for desfeito (foi usado).
- Sala/equipamento: **não implementado** (não existe cadastro de salas).

**Área do cliente ampliada** (Profissional+) — `/cliente`. Pacotes com progresso e validade, fichas
pedidas para preencher (gera link curto de 2 h, mesmas regras do link da ficha), documentos
liberados pela equipe (só as seções do cliente; botão "Liberar na área do cliente" na ficha
enviada), orçamentos para aprovar/recusar, convites da lista de espera, e atualização de e-mail,
aniversário e endereço (nome, telefone e CPF ficam com a equipe).
- O que já existia (horários, remarcar, cancelar, fidelidade) continua para todos os planos.
- Segurança: link pessoal assinado, revogável ("gerar novo link"); nada de custo, comissão ou nota
  interna; nada sensível na URL. Observação: o link pessoal não expira sozinho (só é revogado);
  links de orçamento e de ficha expiram.

**Orçamentos** (Profissional+) — `Clientes → Orçamentos` (`/clientes/orcamentos`) e aba
"Orçamentos" no cliente. Itens (serviço, produto ou livre), quantidade, sessões, valores,
desconto por item e geral, condições, validade, observações, responsável.
- Estados: Rascunho, Enviado, Aprovado, Recusado, Vencido, Cancelado.
- Versões: rascunho nunca enviado é corrigido no lugar; depois de enviado/aprovado, mudar cria
  versão nova, volta para rascunho e derruba os links. A versão aprovada fica guardada.
- Aprovação presa ao hash do conteúdo exibido (equipe, link protegido ou área do cliente).
  Aprovar **não** é pagar: nada é lançado.
- Link protegido `/orcamento/[token]`: expira (validade ou 30 dias), revogável, sem dados do
  cliente na URL, `no-store` e `noindex`.
- Converter em pacote: uma vez só (mesma transação marca o orçamento), pacote nasce "a lançar"
  (sem cobrança). Conversão em venda de produtos: **pendente** (use a comanda).
- Duplicar, cancelar, tarefa de acompanhamento.
- Limite de desconto das Preferências vale no servidor (inclusive para a IA).

**Lista de espera** — no painel da agenda. Dia específico (todos os planos, como antes) ou
preferências (Profissional+): profissionais aceitos, dias da semana, faixa de horário, validade do
interesse e canal autorizado.
- Convite com prazo: guarda o horário (agenda da equipe, link público e outros convites
  respeitam); um convite pendente por horário e por pessoa; aceitar revalida a agenda e cria o
  agendamento uma vez; convites e interesses vencem sozinhos.
- Mensagem: a equipe envia pelo próprio WhatsApp (link pronto) — nada é enviado automaticamente
  pela tela.

## ETAPA 2

**Central de aprovações** — `/dashboard/aprovacoes` (atalho no assistente e no sino). Propostas
da IA (assistente ou rotina) com quem pediu, origem, ação, registros afetados, prazo, situação,
resultado ou erro. Aprovar e executar · recusar (com motivo) · corrigir com o assistente.
- Administrador decide propostas de qualquer pessoa; a equipe, as próprias. A execução usa as
  permissões de quem aprova, revalidadas na hora; se os dados mudaram, a proposta volta com o
  conteúdo novo para aprovar de novo; nunca executa duas vezes.
- Custo exibido: a execução não chama o modelo (o custo de IA foi o da conversa, já medido).
- Tipos novos de proposta: preparar orçamento (rascunho) e criar tarefa. Importação e mensagens
  não passam pela IA (importação é manual; mensagens não são enviadas pela IA).

**Preferências do negócio** — Configurações → "Preferências do negócio" (só administradores).
- Linguagem (tom, observações, quando chamar uma pessoa): vai ao assistente como dado delimitado;
  não libera ações.
- Regras do servidor: janela de contato (mensagens de rotinas só nela), desconto máximo em
  orçamentos, resumo do dia automático e hora, avisos do sino, pausas.
- A IA não tem ferramenta para mudar preferências, autorizações nem o próprio modo.
- Campos no banco ainda sem uso: `approvalAboveCents`, `autoSpendLimitUnits` (nenhuma rotina atual
  movimenta dinheiro ou usa IA) — não aparecem na tela.

**Importação assistida** (Profissional+, administradores) — botão "Importar" em Clientes e em
Estoque. Arquivo CSV → colunas reconhecidas → mapeamento sugerido → validação por linha →
duplicados → prévia → confirmação → importação → relatório por linha.
- Processamento convencional (sem IA). Duplicado só por chave exata (telefone, e-mail, CPF;
  código ou nome idêntico do produto); nome parecido vira aviso, nunca junção.
- Nada é sobrescrito: "completar só os campos vazios" é opcional; estoque de produto existente
  nunca muda pela importação; produto novo com quantidade registra a entrada "Saldo inicial".
- Limites: 900 KB, 5.000 linhas, 60 colunas. O arquivo não é guardado (só hash e relatório sem
  dados). Repetir o mesmo arquivo com as mesmas escolhas devolve o relatório anterior.
- Fórmulas: textos importados perdem `=`, `+`, `@` iniciais; exportações CSV (relatório e
  financeiro) neutralizam células que começariam com fórmula.
- No Básico continua a importação simples de clientes que já existia.

**Assistente** — novas ferramentas: preparar orçamento, criar tarefa (só propõem), orçamentos do
cliente, lista de espera e resumo do dia (só leitura). O prompt pede plano visível em pedidos com
vários passos e proíbe repetir passos.

## ETAPA 3

**Resumo do dia** — cartão "Resumo do dia" no painel (Profissional+, sob demanda); no Pro, gerado
sozinho depois da hora configurada (rota diária + na abertura do painel). Atendimentos, fichas
pendentes, sinais PIX aguardando, pacotes terminando, orçamentos aguardando, a receber (só
admin), estoque e falta de material, tarefas e convites pendentes — cada item com link.
Cálculo determinístico; "Explicar com o assistente" só abre o assistente, que lê o mesmo resumo.

**Tarefas** — cartão "Tarefas" no painel (manuais, do assistente ou de rotinas), com aviso no sino.

**Renovação de pacotes** (Pro, rotina autorizada) — penúltima sessão, saldo baixo, perto de vencer
ou terminou sem próximo agendamento → tarefa com sugestão de contato e, nos dois primeiros casos,
orçamento de renovação em rascunho. Nunca renova, cobra ou envia mensagem; uma vez por
pacote+gatilho; origem gravada (`automation:package_renewal`).

**Lista de espera automática** (Pro, rotina autorizada) — convida UMA pessoa por vaga compatível
(a mais antiga), com prazo, até o limite diário; mensagem real só com Z-API configurada + cliente
que autorizou WhatsApp + janela de contato + autorização com "pode mandar WhatsApp".

**Ações automáticas** — `/dashboard/automacoes` (atalho nas Preferências): pausar tudo ou por
rotina, autorizar rotina (máximo por dia, horário, mensagens), executar agora, histórico (inclusive
puladas, com motivo), o que está em andamento (convites já feitos seguem até o prazo).
Retomar não dispara atraso: cada execução revalida plano, modo "Executar regras autorizadas",
autorização, limites e pausa. Downgrade para Profissional para as rotinas sem apagar nada.

**Resultados das automações** (Pro, admin) — mesma página: tarefas, renovações (preparadas,
aprovadas, convertidas, vendido, recebido), vagas preenchidas (convites, aceitos, agendado,
realizado, recebido), mensagens e usos de IA. Critério escrito na tela: só conta o que a rotina
originou; sem "tempo economizado".

**Rota de cron** — `/api/cron/automations` (vercel.json, diária 10:00 UTC, `CRON_SECRET`). O plano
da Vercel só permite execução diária: por isso o resumo também é gerado ao abrir o painel.

## ETAPA 4 (parcial)

Feito: checklist por serviço (Profissional+), ficha de consumo de materiais por serviço (já
existente), margem de contribuição por serviço (Pro, Relatórios), vendido × a receber × recebido
(Financeiro, todos os planos), sinal por PIX (já existente, depende da conta Asaas do salão),
fechamento de caixa e contas a receber (já existentes).

Pendente: agendamentos recorrentes com edição de uma ocorrência/seguintes; indicação com
recompensa condicional; pausa de pacote; comissão por venda (hoje é por execução); jornada por
serviço; evolução por fotos/medidas; salas e equipamentos com preparo/limpeza; recebimento parcial
de compras; sugestão de reposição; acompanhamento de agendamento online não concluído; compras por
foto/documento (depende de IA com visão e créditos do provedor); comandos de voz.

## Dependências de integração

- IA: `GEMINI_API_KEY` com créditos; franquias (`monthlyUnits`) ainda `null` → IA pausada em
  produção até a decisão comercial.
- WhatsApp automático: Z-API configurada por empresa (Configurações).
- Sinal por PIX: chave Asaas do salão. Cobrança da assinatura: `ASAAS_API_KEY` + `BILLING_ENFORCE`.
- Rotinas: `CRON_SECRET` e o cron da Vercel.
