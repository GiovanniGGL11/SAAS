# Trabalho noturno (agente)

Checklist de progresso do agente que trabalha sozinho no branch `claude/noturno`.
Cada execução continua do primeiro item não marcado.

## 1. Endereço do cliente com busca por CEP

- [x] Campos `zipCode`, `street`, `number`, `complement`, `district`, `city`, `state` no `Client` + migração SQL
- [x] Formulário com CEP mascarado e busca no ViaCEP (carregando, erro, não sobrescrever o digitado)
- [x] Endereço na ficha com "Abrir no mapa"
- [x] Importação CSV aceitando as colunas novas

## 2. Assistente com IA (Gemini)

- [ ] Núcleo: cliente Gemini (REST), loop de function calling, ferramentas de leitura, rate limit
- [ ] Ferramentas de escrita como "ação proposta" + server action de confirmação (revalida, efeitos colaterais, auditoria)
- [ ] Interface: atalho no painel, painel lateral/bottom sheet, sugestões, markdown simples, cartões de confirmação
- [ ] Testes (despacho, proposta → confirmação, isolamento entre empresas) com Gemini falso

## 3. Sino de notificações

- [ ] Dados: estoque baixo, próximos agendamentos, amanhã sem confirmação, criados/cancelados pelo cliente, aniversariantes
- [ ] Interface: sino no topbar (desktop e celular), contador, popover/bottom sheet, lido/dispensado no localStorage

## Decisões
- Endereço: CEP guardado só com dígitos; UF em maiúsculas. A busca no ViaCEP só troca campos vazios ou que a própria busca anterior preencheu — nada digitado à mão (nem o que já estava salvo) é sobrescrito.
- Importação: colunas reconhecidas `cep`, `rua`/`logradouro`/`endereço`, `número`/`num`, `complemento`, `bairro`, `cidade`/`município`, `uf`/`estado`. CEP sem 8 dígitos ou UF que não seja 2 letras são ignorados.

## Pendências

## Para o dono fazer
- Aplicar a migração `prisma/migrations/20261014020000_add_client_address` (`npx prisma migrate deploy`).
- Testar: cadastrar cliente com CEP (ex.: 01310-100), conferir o preenchimento, editar à mão e trocar o CEP; ver "Abrir no mapa" na ficha; importar a planilha modelo nova.
