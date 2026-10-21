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
| Antecedência mínima e intervalo dos horários do link público | Configurações → Agendamento online (`bookingLeadMinutes`, `bookingSlotStep`; opções em `LEAD_MINUTES_OPTIONS`) |
| Pagamento adiantado por PIX no link (sinal ou valor total, obrigatório ou escolha do cliente) | Configurações → Pagamento adiantado por PIX (`depositPercent`, `depositRequired`; exige a chave da Asaas do próprio negócio) |
| Tipo de preço e visibilidade no agendamento online | Cadastro do serviço ("Como mostrar o preço", "Aparece no agendamento online"); rótulos em `src/lib/catalog.ts` |

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

## Integrações necessárias

- **Central de comunicação:** precisa de recebimento de mensagens do WhatsApp (webhook de entrada). Não existe; nenhuma tela simula conversas.
- **Anexos e imagens do catálogo:** precisam de armazenamento de arquivos. Não existe.
- **Agendamento das regras:** `CRON_SECRET` e o agendador chamando `/api/cron/automations`.
- **IA:** créditos do provedor e franquias por plano (`docs/planos-e-ia.md`).
- **Cobrança:** Asaas. Nada foi ativado nesta entrega.

## Pendências

- Central de comunicação e anexos (dependem das integrações acima).
- Assistente por voz.
- Imagens no catálogo público.
- Filtros e relatórios por campo personalizado.
- Metas por período além das metas que já existem.
