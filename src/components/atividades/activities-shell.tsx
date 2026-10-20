'use client';

import * as React from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { TasksView } from '@/components/atividades/tasks-view';
import { MyDayView } from '@/components/atividades/my-day-view';

type Tab = 'meu-dia' | 'tarefas';

/** Atividades: "Meu dia" (o que precisa de atenção) e a lista completa de tarefas. */
export function ActivitiesShell({
  timezone,
  initialTab,
  initialTaskId,
}: {
  timezone: string;
  initialTab: Tab;
  initialTaskId?: string;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  function change(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('aba', next);
    url.searchParams.delete('tarefa');
    window.history.replaceState(null, '', url);
  }
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        className="self-start"
        value={tab}
        onValueChange={change}
        options={[
          { value: 'meu-dia', label: 'Meu dia' },
          { value: 'tarefas', label: 'Tarefas' },
        ]}
      />
      {tab === 'meu-dia' ? (
        <MyDayView timezone={timezone} />
      ) : (
        <TasksView timezone={timezone} initialTaskId={initialTaskId} />
      )}
    </div>
  );
}
