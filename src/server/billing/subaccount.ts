import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { openSecret, sealSecret } from '@/server/secret-box';
import {
  AsaasError,
  createSubaccount,
  getAccountStatus,
  type AsaasApprovalStatus,
  type AsaasSubaccountInput,
} from '@/server/billing/asaas';

/*
  Conta Asaas do negócio criada pelo próprio Atendafy (subconta da conta da plataforma), para quem
  não quer abrir conta e colar chave. O dinheiro dos pagamentos é 100% do negócio: a subconta tem
  saldo próprio, e o titular ativa pelo e-mail da Asaas e envia os documentos lá.
*/

export function canCreateSubaccount(): boolean {
  return Boolean(process.env.ASAAS_API_KEY?.trim());
}

export async function createCompanySubaccount(companyId: string, input: AsaasSubaccountInput) {
  const platformKey = process.env.ASAAS_API_KEY?.trim();
  if (!platformKey) throw new UserError('A criação de conta Asaas ainda não está disponível.');
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { asaasApiKey: true },
  });
  if (company.asaasApiKey) throw new UserError('Este negócio já tem uma conta Asaas conectada.');
  let account;
  try {
    account = await createSubaccount(platformKey, input);
  } catch (error) {
    if (error instanceof AsaasError) throw new UserError(`A Asaas recusou: ${error.message}`);
    throw error;
  }
  const apiKey = account.accessToken?.apiKey ?? account.apiKey;
  if (!apiKey) {
    // Conta criada sem chave na resposta: não há como recuperar depois; registra para suporte.
    await prisma.company.update({
      where: { id: companyId },
      data: { asaasAccountId: account.id, asaasWalletId: account.walletId },
    });
    throw new UserError(
      'A Asaas criou a conta, mas não devolveu a chave de acesso. Fale com o suporte do Atendafy.',
    );
  }
  await prisma.company.update({
    where: { id: companyId },
    data: {
      asaasApiKey: sealSecret(apiKey),
      asaasAccountId: account.id,
      asaasWalletId: account.walletId,
    },
  });
}

/** Situação geral de aprovação da conta conectada (null se não deu para consultar). */
export async function companyAccountStatus(
  sealedKey: string | null,
): Promise<AsaasApprovalStatus | null> {
  if (!sealedKey) return null;
  try {
    return (await getAccountStatus(openSecret(sealedKey))).general ?? null;
  } catch {
    return null;
  }
}
