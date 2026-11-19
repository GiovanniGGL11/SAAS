'use client';

import * as React from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { OpportunitiesView } from '@/components/comercial/opportunities-view';
import { QuotesView } from '@/components/orcamentos/quotes-view';
import { HowToButton } from '@/components/tutorial/tutorial-kit';

type Tab = 'oportunidades' | 'orcamentos';

/** Comercial: funil de oportunidades e orçamentos, no mesmo lugar. */
export function CommercialShell({
  timezone,
  isAdmin,
  crm,
  quotes,
  initialTab,
  quoteId,
  newQuoteFor,
  opportunityId,
}: {
  timezone: string;
  isAdmin: boolean;
  crm: boolean;
  quotes: boolean;
  initialTab: Tab;
  quoteId?: string;
  newQuoteFor?: string;
  opportunityId?: string;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  function change(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    for (const key of ['id', 'novo', 'oportunidade']) url.searchParams.delete(key);
    url.searchParams.set('aba', next);
    window.history.replaceState(null, '', url);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {crm && quotes ? (
          <SegmentedControl
            value={tab}
            onValueChange={change}
            options={[
              { value: 'oportunidades', label: 'Oportunidades' },
              { value: 'orcamentos', label: 'Orçamentos' },
            ]}
          />
        ) : (
          <span />
        )}
        <HowToButton
          href={`/comercial/tutorial#${tab === 'orcamentos' ? 'orcamento' : 'oportunidades'}`}
        />
      </div>
      {tab === 'oportunidades' && crm ? (
        <OpportunitiesView
          timezone={timezone}
          isAdmin={isAdmin}
          quotesEnabled={quotes}
          initialOpenId={!newQuoteFor ? opportunityId : undefined}
        />
      ) : (
        <QuotesView
          timezone={timezone}
          initialOpenId={quoteId}
          initialNewForClient={newQuoteFor}
          initialOpportunityId={newQuoteFor ? opportunityId : undefined}
        />
      )}
    </div>
  );
}
