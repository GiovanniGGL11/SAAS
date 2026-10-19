import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { buildAiSession } from '@/server/ai/access';
import { AI_BLOCK_MESSAGE } from '@/lib/billing/entitlements';
import { PageHeader } from '@/components/layout/page';
import { ApprovalsCenter } from '@/components/assistant/approvals-center';

export const metadata = { title: 'Central de aprovações' };

export default async function AprovacoesPage() {
  const session = await requireCurrentCompany();
  const ai = buildAiSession({
    company: session.company,
    userId: session.userId,
    isAdmin: isCompanyAdmin(session),
  });
  const available = ai.entitlements.ai.available.assistedActions;
  const reason = ai.entitlements.ai.reasons.assistedActions;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Central de aprovações"
        description="O que a IA preparou e só vale depois da sua aprovação."
      />
      <ApprovalsCenter
        aiAvailable={available}
        blockedMessage={available ? null : AI_BLOCK_MESSAGE[reason ?? 'not_in_plan']}
      />
    </div>
  );
}
