'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/layout/page';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { FinanceView } from '@/components/financeiro/finance-view';
import { IncomeStatementView } from '@/components/financeiro/income-statement-view';
import { CommissionsView } from '@/components/financeiro/commissions-view';
import { RecurringExpensesView } from '@/components/financeiro/recurring-expenses-view';
import { FinanceSettingsView } from '@/components/financeiro/finance-settings-view';

const TABS = [
  { value: 'lancamentos', label: 'Lançamentos' },
  { value: 'dre', label: 'DRE' },
  { value: 'comissoes', label: 'Comissões' },
  { value: 'contas-fixas', label: 'Contas fixas' },
  { value: 'ajustes', label: 'Ajustes' },
] as const;

type Tab = (typeof TABS)[number]['value'];

/** Financeiro em abas; a aba fica no endereço (?aba=dre) para dar para voltar e compartilhar. */
export function FinanceShell() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('aba');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'lancamentos';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas, resultado do mês e taxas."
      />
      <SegmentedControl
        value={tab}
        onValueChange={(next) =>
          router.replace(next === 'lancamentos' ? pathname : `${pathname}?aba=${next}`, {
            scroll: false,
          })
        }
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
        className="self-start"
      />
      {tab === 'lancamentos' && <FinanceView />}
      {tab === 'dre' && <IncomeStatementView />}
      {tab === 'comissoes' && <CommissionsView />}
      {tab === 'contas-fixas' && <RecurringExpensesView />}
      {tab === 'ajustes' && <FinanceSettingsView />}
    </div>
  );
}
