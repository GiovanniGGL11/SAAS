# Cobrança pela Asaas

Dois usos, contas diferentes:

| Uso                                               | Conta Asaas     | Onde fica a chave                                |
| ------------------------------------------------- | --------------- | ------------------------------------------------ |
| Assinatura do Atendafy (empresa paga o plano)     | da plataforma   | `ASAAS_API_KEY` na Vercel                        |
| Pagamento adiantado / sinal no agendamento online | de cada empresa | cifrada em `Company.asaasApiKey` (Configurações) |

A chave decide o ambiente: `$aact_hmlg_...` vai para o sandbox, `$aact_prod_...` para produção.

## Variáveis (Vercel)

| Nome                  | Para quê                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `ASAAS_API_KEY`       | chave da conta da plataforma. Sem ela a tela mostra os planos e o teste, mas não cobra.     |
| `ASAAS_WEBHOOK_TOKEN` | 32 a 255 caracteres; o mesmo cadastrado no webhook. Sem ele a rota do webhook responde 503. |
| `BILLING_ENFORCE`     | `true` bloqueia quem não pagou (teste acabou e sem assinatura em dia). Ligar por último.    |

## Colocar no ar

1. **Sandbox**: criar conta em sandbox.asaas.com, gerar a chave e um token (`openssl rand -hex 32`).
2. Pôr as duas variáveis no ambiente Preview da Vercel e cadastrar o webhook:
   `ASAAS_API_KEY=... ASAAS_WEBHOOK_TOKEN=... node scripts/asaas-webhook.mjs https://<preview> <email>`
3. Testar em `/assinatura`: assinar, pagar a fatura no sandbox (botão "confirmar pagamento" do painel),
   ver o status virar "Assinatura ativa", trocar de plano, cancelar.
4. **Produção**: conta Asaas da empresa (CNPJ) aprovada, chave de produção, mesmas variáveis em
   Production, webhook cadastrado com o domínio final.
5. Depois de uma primeira cobrança real dar certo, `BILLING_ENFORCE=true`.

## Ciclo

- Assinar durante o teste: a 1ª cobrança vence no fim do teste; depois disso, hoje. O cliente escolhe
  PIX, boleto ou cartão na fatura da Asaas.
- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`: ativa e estende o período até vencimento + 1 mês.
- `PAYMENT_OVERDUE`: atrasada; tolerância de `PAST_DUE_GRACE_DAYS` contada do fim do período (ou do
  vencimento, na 1ª cobrança). Atraso de cobrança cujo período já está pago é ignorado.
- `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK_REQUESTED`: o período daquela cobrança deixa de valer.
- `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` e cancelar na tela: vale até o fim do período pago.
- Troca de plano: mesma assinatura, novo valor (inclusive na cobrança em aberto). Não deixa ir para
  um plano com menos profissionais do que os ativos.
- Cada evento (`id`) é guardado em `BillingWebhookEvent` e processado uma vez só.

## Nota fiscal

A Asaas emite NFS-e das cobranças (menu Notas Fiscais, configurar com os dados da prefeitura) — pode
resolver a pendência de NFS-e sem outro fornecedor.
