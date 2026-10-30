# Gestão completa — tarefas, comercial, serviços em andamento, indicações, regras e indicadores

Segunda rodada de evolução do Atendafy como sistema genérico para qualquer negócio de hora marcada.
Nada aqui é específico de um segmento: anamnese e afins viraram **modelos opcionais** de formulário.
A primeira rodada (orçamentos, portal, lista de espera, aprovações, rotinas) está em
`docs/evolucao-operacional.md`; planos e IA em `docs/planos-e-ia.md`.

## Onde configurar

| O quê | Onde |
| --- | --- |
| Que plano libera cada recurso | `FeatureKey` e `ESSENTIAL_FEATURES` / `FULL_FEATURES` / `PRO_FEATURES` em `src/lib/billing/plans.ts` |
| Conferência no servidor | `assertFeature` / `hasFeature` em `src/server/billing/features.ts` (toda ação nova passa por aí) |
| Etapas do funil comercial | Tela Comercial → "Etapas" (padrão em `DEFAULT_STAGES`, `src/server/data/crm.ts`) |
| Etapas dos serviços em andamento | Atividades → Serviços em andamento → "Etapas" (`src/server/data/jobs.ts`) |
| Campos personalizados | Configurações → Campos personalizados |
| Modelos prontos de formulário | `STARTER_TEMPLATES` em `src/lib/forms/starter.ts` |
| Regras de automação | Automações → Regras (gatilhos e ações em `src/server/automations/rules.ts`) |
| Antecedência mínima e intervalo dos horários do link público | Link do cliente → Agendamento (`bookingLeadMinutes`, `bookingSlotStep`; opções em `LEAD_MINUTES_OPTIONS`) |
| Pagamento adiantado por PIX no link (sinal ou valor total, obrigatório ou escolha do cliente) | Link do cliente → Pagamento (`depositPercent`, `depositRequired`; exige a chave da Asaas do próprio negócio) |
| Tipo de preço e visibilidade no agendamento online | Link do cliente → Serviços no link (liga/desliga) e cadastro do serviço ("Como mostrar o preço", "Aparece no agendamento online"); rótulos em `src/lib/catalog.ts` |

## Recursos por plano

| Recurso | Básico | Profissional | Pro |
| --- | :-: | :-: | :-: |
| Tarefas e lembretes, "Meu dia", histórico do cliente, financeiro essencial, catálogo | ✓ | ✓ | ✓ |
| CRM (oportunidades e funil), campos personalizados, pesquisas, indicações, orçamentos, portal, formulários | | ✓ | ✓ |
| Serviços em andamento, regras de automação, indicadores avançados | | | ✓ |

Ao perder o plano, os dados ficam guardados e visíveis onde já eram; criar ou alterar dentro do
recurso bloqueado é recusado pelo servidor. Regras ativas deixam de rodar (conferência a cada execução).

## O que foi feito

### 1. Tarefas e lembretes (Atividades → Tarefas)
Prioridade, responsável (só membros da equipe), checklist, comentários, lembrete, recorrência
(a próxima é criada ao concluir, sem duplicar), em andamento/cancelada, vínculo com cliente,
oportunidade, serviço em andamento ou lançamento.

### 2. CRM (Comercial → Oportunidades)
Funil com etapas editáveis, mudança de etapa protegida contra edição simultânea (perdida exige
motivo), interações, tarefa de retorno, conversão de contato em cliente e vínculo com orçamento.

### 3. Orçamentos (Comercial → Orçamentos)
Reaproveita a primeira rodada; agora o orçamento aprovado pode **virar venda** (um lançamento a
receber pendente + baixa de estoque dos produtos, numa transação) ou **virar serviço em andamento**.

### 4. "Meu dia" (Atividades → Meu dia)
Atendimentos, tarefas, retornos, orçamentos sem resposta e contas (só administradores), por urgência.

### 5. Campos personalizados
Texto, número, data, sim/não e lista, em clientes, serviços e oportunidades; obrigatórios conferidos no servidor.

### 6. Portal do cliente
Mostra também os serviços em andamento do cliente (só etapa e prazo) e os pagamentos pendentes. Notas internas nunca aparecem.

### 7. Formulários e documentos
Seis modelos prontos (cadastro, questionário, autorização, checklist, termo, pesquisa); anamnese é um modelo opcional.

### 8. Serviços em andamento (Pro — Atividades)
Etapas próprias, responsável, prazo, checklist, comentários, vínculo com atendimentos e criação a
partir de orçamento aprovado. Histórico de cada mudança (`JobEvent`).

### 9. Pesquisas e indicações
- Avaliação: o link do Google aparece para **qualquer nota**. Não há filtro que esconda avaliações ruins.
- O cliente autoriza a publicação do depoimento à parte.
- Nota baixa pode gerar tarefa de retorno, sem duplicar.
- Indicações: sem autoindicação nem duplicadas. Passam a qualificadas quando o indicado conclui um atendimento. A recompensa é concedida manualmente, uma vez.

### 10. Regras de automação e indicadores (Pro)
- Gatilhos: orçamento sem resposta, atendimento concluído, conta a vencer, serviço atrasado e oportunidade parada.
- Ações: criar tarefa ou avisar no sino. **Nenhuma regra envia mensagem ao cliente.**
- Cada regra tem prévia, limite por dia e janela de relevância. Respeita a pausa geral e evita duplicidade por chave.
- Indicadores: conversão, aprovação de orçamentos, clientes que voltam, prazos de tarefas e serviços, funil estimado × recebido, tempo por etapa e por responsável.

### Histórico do cliente (Clientes → ficha → Linha do tempo)
Atendimentos, orçamentos, pagamentos, vendas, tarefas, documentos, interações, serviços e
avaliações, com link para a origem. Valores só para administradores; filtro "só o que o cliente também vê".

### Financeiro essencial
- Conta parcelada (2 a 36 parcelas pendentes, mensais; centavos sem sobra).
- O painel separa **Orçado · Vendido · Recebido · A vencer · Vencido · Estornado/cancelado**.
- Orçado não é venda.

### Catálogo
- Preço fixo, "a partir de" ou "sob consulta".
- O item pode ficar fora do agendamento online: some do link público e o servidor recusa reservas nele.
- Custo e comissão nunca aparecem para o cliente.

## Migrações (todas aditivas)

| Migração | Situação |
| --- | --- |
| `20261020090000_tasks_crm_custom_fields` | aplicada |
| `20261020120000_jobs_referrals_rules` | aplicada |
| `20261021090000_service_catalog` | aplicada |
| `20261021120000_booking_lead_minutes` | aplicada |
| `20261021150000_deposit_optional` | aplicada |
| `20261022090000_period_goals` | aplicada |
| `20261022120000_marketing_opt_out` | aplicada |
| `20261022150000_service_buffer` | aplicada |
| `20261030090000_service_professionals` | aplicada |

## Integrações necessárias

- **Central de comunicação:** precisa de recebimento de mensagens do WhatsApp (webhook de entrada). Não existe; nenhuma tela simula conversas.
- **Anexos e imagens do catálogo:** precisam de armazenamento de arquivos. Não existe.
- **Agendamento das rotinas:** o `vercel.json` já chama `/api/cron/reminders` e `/api/cron/automations` todo dia, mas em produção falta a variável `CRON_SECRET` (sem ela as duas rotas respondem 503 e nada roda).
- **IA:** créditos do provedor e franquias por plano (`docs/planos-e-ia.md`).
- **Cobrança:** Asaas. Nada foi ativado nesta entrega.

### Metas por período (Pro — Relatórios)
Um alvo por mês para Recebido, Atendimentos concluídos, Clientes novos e Orçamentos aprovados; o realizado vem dos registros e a projeção (só no mês em andamento) é o ritmo atual até o fim do mês. "Copiar metas do mês anterior" não sobrescreve metas já definidas. As metas antigas (faturamento do mês no painel e meta por profissional) continuam como estavam.

### Filtro por campo personalizado (Clientes)
"Filtrar por campo": texto contém, sim/não, opção, faixa de número ou data, preenchido e sem resposta. Filtrado no servidor; campo "só administradores" não filtra para a equipe.

### Assistente por voz (ditado)
Botão de microfone no assistente: a fala vira texto na caixa (reconhecimento do próprio navegador — Chrome, Edge ou Safari; no Chrome o áudio passa pelo serviço de voz do Google). Nada é enviado sozinho e as ações continuam pedindo aprovação. Vale nos planos com assistente.

### Aviso de horário incomum (Profissionais → Expediente)
Começar antes das 06:00 ou terminar depois das 22:00 pergunta "tem certeza?". Não impede: confirmando, salva.

### Consentimento de marketing (LGPD)
Promoções — campanhas (manual e automática) e parabéns de aniversário — levam no fim o link `/descadastrar/[token]` (assinado). Quem sai fica fora, inclusive de campanha já criada; a equipe também registra na ficha ("Recebe promoções"). Confirmação, lembrete, avaliação e convite da lista de espera continuam (são mensagens de serviço). Tudo na auditoria.

### Direitos do titular (LGPD — ficha do cliente, administradores)
"Exportar dados" baixa um JSON com tudo o que o sistema guarda sobre a pessoa. "Anonimizar cliente" apaga identificação, campos personalizados, observações e mensagens e revoga links do portal e das fichas; mantém o financeiro (obrigação fiscal); fichas só saem com a opção marcada (prontuário). Exige digitar ANONIMIZAR, recusa com horário futuro marcado e não repete.

### Intervalo de preparo (Serviços)
"Intervalo de preparo depois" (0–120 min) por serviço, copiado para o atendimento ao marcar (o maior, se forem vários). Agenda, mover/redimensionar, link público, próximo horário livre e convites da lista de espera não encaixam ninguém nesse tempo; o cliente continua vendo só a duração. Vale entre atendimentos (bloqueios não mudam).

### Testes e banco
Os testes usam o mesmo banco da produção: `deleteTestCompany` só apaga empresa criada pelos testes e a rotina diária de WhatsApp aceita uma empresa só (`onlyCompanyId`). O ideal continua sendo um banco exclusivo para testes.

### Link do cliente (menu lateral, administradores)
Página única com tudo o que o cliente vê: visão geral (link, copiar, abrir, enviar pelo WhatsApp, QR code para imprimir e a lista "Pronto para divulgar?"), Agendamento (ligar, intervalo, antecedência), Serviços no link (liga/desliga por serviço), Página (endereço, Instagram, política), Pagamento (PIX), Área do cliente e Avaliações. Esses cartões saíram de Configurações, que agora tem um atalho para cá.

### Quem faz cada serviço e preço por profissional (Serviços)
No cadastro do serviço, com mais de um profissional: "Todos, mesmo preço" (padrão, como sempre) ou "Escolher profissionais e preços" — marca quem faz e, se quiser, um preço próprio para cada um (vazio = preço do serviço). O atendimento grava o preço de quem atende; a agenda e o link só oferecem quem faz o serviço; marcar ou mover para quem não faz é recusado. No link, cada profissional mostra o seu preço e "primeiro disponível" mostra "a partir de" quando os preços variam. Mover um atendimento mantém o preço combinado.

## Pendências

- Central de comunicação e anexos (dependem das integrações acima).
- Imagens no catálogo público.
- Filtro por campo personalizado nas listas de serviços e oportunidades (clientes já tem) e relatórios por campo.
