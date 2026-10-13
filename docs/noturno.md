# Trabalho noturno (agente)

Checklist de progresso do agente que trabalha sozinho no branch `claude/noturno`.
Cada execução continua do primeiro item não marcado.

## 1. Endereço do cliente com busca por CEP

- [x] Campos `zipCode`, `street`, `number`, `complement`, `district`, `city`, `state` no `Client` + migração SQL
- [x] Formulário com CEP mascarado e busca no ViaCEP (carregando, erro, não sobrescrever o digitado)
- [x] Endereço na ficha com "Abrir no mapa"
- [x] Importação CSV aceitando as colunas novas

## 2. Assistente com IA (Gemini)

- [x] Núcleo: cliente Gemini (REST), loop de function calling, ferramentas de leitura, rate limit
- [x] Ferramentas de escrita como "ação proposta" + server action de confirmação (revalida, efeitos colaterais, auditoria)
- [x] Interface: atalho no painel, painel lateral/bottom sheet, sugestões, markdown simples, cartões de confirmação
- [x] Testes (despacho, proposta → confirmação, isolamento entre empresas) com Gemini falso

## 3. Sino de notificações

- [x] Dados: estoque baixo, próximos agendamentos, amanhã sem confirmação, criados/cancelados pelo cliente, aniversariantes
- [x] Interface: sino no topbar (desktop e celular), contador, popover/bottom sheet, lido/dispensado no localStorage

## Decisões
- Endereço: CEP guardado só com dígitos; UF em maiúsculas. A busca no ViaCEP só troca campos vazios ou que a própria busca anterior preencheu — nada digitado à mão (nem o que já estava salvo) é sobrescrito.
- Importação: colunas reconhecidas `cep`, `rua`/`logradouro`/`endereço`, `número`/`num`, `complemento`, `bairro`, `cidade`/`município`, `uf`/`estado`. CEP sem 8 dígitos ou UF que não seja 2 letras são ignorados.
- Assistente: modelo padrão `gemini-flash-latest` (alias do Google para o Flash estável mais novo). A documentação do Google não abriu daqui (proxy), então o nome exato da versão não foi conferido; troque por `GEMINI_MODEL` se quiser fixar uma versão (ex.: `gemini-2.5-flash`).
- Assistente: REST via `fetch` (sem SDK), loop de até 6 passos por mensagem, 12 mensagens/min por usuário. O navegador manda só o texto da conversa (últimas 20); resultados de ferramentas não voltam do navegador.
- Assistente: escritas viram proposta (cartão com Confirmar/Cancelar); a confirmação (`confirmAssistantActionAction`) valida de novo com zod e contra o banco da empresa da sessão, usa as mesmas funções de `src/server/data/*`, sincroniza o Google Agenda e revalida as telas. Pelo assistente só se remarca/cancela agendamento marcado ou confirmado; nada de excluir, financeiro, estoque, configurações ou membros.
- Assistente: financeiro e relatórios só para admin (mesma regra das telas). Criar/editar cliente pelo assistente grava AuditLog (`Client`, `created`/`updated`, `source: assistant`); agendamentos já eram auditados pela camada de dados.
- Assistente: histórico só no `sessionStorage` da aba, separado por empresa.
- Sino: avisos calculados na hora, sem tabela. Atividade do cliente vem do AuditLog (autores `online-booking`, `client-portal`, `client-link`, últimas 48 h): reservou, remarcou, cancelou, confirmou. Também: atendimentos nas próximas 2 h, um resumo dos de amanhã ainda "marcados" (sem confirmação), estoque baixo e aniversariantes do dia. Cada consulta tem limite.
- Sino: novo índice `AuditLog(companyId, createdAt)` para a consulta de atividade (roda a cada minuto por pessoa logada).
- Sino: "lido" ao abrir a lista; "dispensado" pelo X ou "Limpar todos". Guardado no localStorage por empresa e usuário (com try/catch). React Query a cada 60 s, pausando com a aba oculta.
- Agenda: aceita `/agenda?data=AAAA-MM-DD&agendamento=<id>` (abre o dia e o atendimento) — é o destino dos avisos.

## Pendências
- Sino/assistente: a largura em 375px foi conferida só pelo código (sem Clerk aqui não dá para abrir o painel); o topo agora tem busca, assistente, sino, tema e usuário — vale olhar num celular de verdade.
- Assistente: criar/editar cliente pelas telas normais não grava AuditLog (só pelo assistente). Avaliar se vale padronizar.

## Para o dono fazer
- Criar a chave do Gemini em https://aistudio.google.com/apikey e cadastrar `GEMINI_API_KEY` na Vercel (Production e Preview). Opcional: `GEMINI_MODEL`.
- Rodar `npm test -- tests/assistant.test.ts` com o banco de teste.
- Testar o assistente (ícone ✦ no topo): "Como está minha agenda amanhã?", "Quem não volta há 60 dias?", "Cadastrar cliente João, 11 98888-7777", marcar/remarcar/cancelar e confirmar no cartão; logar como membro (não admin) e pedir o faturamento (deve recusar). No celular (375px) o painel abre como bottom sheet.
- Aplicar as migrações `prisma/migrations/20261014020000_add_client_address` e `20261014030000_add_audit_log_created_at_index` (`npx prisma migrate deploy`).
- Rodar `npm test -- tests/notifications.test.ts`.
- Testar o sino: fazer uma reserva pela página pública e cancelar pelo link do cliente (devem aparecer com contador); produto com quantidade ≤ mínimo; cliente com aniversário hoje; clicar num aviso de agenda abre o dia certo com o atendimento; dispensar e recarregar a página (não volta).
- Testar: cadastrar cliente com CEP (ex.: 01310-100), conferir o preenchimento, editar à mão e trocar o CEP; ver "Abrir no mapa" na ficha; importar a planilha modelo nova.
