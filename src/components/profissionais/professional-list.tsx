'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, UserRoundIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { motion } from 'motion/react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AppleTile } from '@/components/dashboard/apple-tile';
import { PageHeader, Surface } from '@/components/layout/page';
import {
  InitialsAvatar,
  ListToolbar,
  SearchField,
  matchesSearch,
} from '@/components/layout/list-controls';
import { EmptyState } from '@/components/ui/empty-state';
import { ProfessionalDrawer } from '@/components/profissionais/professional-drawer';
import {
  listProfessionalsAction,
  setProfessionalActiveAction,
} from '@/server/actions/professional-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedProfessional } from '@/lib/serialize';

type ProfessionalWithProduction = SerializedProfessional & {
  production: { appointmentCount: number; revenue: number };
};

function formatCommission(professional: SerializedProfessional): string {
  if (!professional.commissionType || professional.commissionValue === null) return '—';
  return professional.commissionType === 'PERCENTAGE'
    ? `${professional.commissionValue}%`
    : formatCurrencyBRL(professional.commissionValue);
}

export function ProfessionalList({
  initialProfessionals,
}: {
  initialProfessionals: ProfessionalWithProduction[];
}) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'active' | 'inactive' | 'all'>('active');
  const [editingProfessional, setEditingProfessional] =
    React.useState<SerializedProfessional | null>(null);

  const { data: professionals } = useQuery({
    queryKey: ['professionals'],
    queryFn: listProfessionalsAction,
    initialData: initialProfessionals,
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setProfessionalActiveAction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['professionals'] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  function openCreate() {
    setEditingProfessional(null);
    setDrawerOpen(true);
  }

  function openEdit(professional: SerializedProfessional) {
    setEditingProfessional(professional);
    setDrawerOpen(true);
  }

  const filtered = professionals.filter((professional) => {
    if (filter === 'active' && !professional.active) return false;
    if (filter === 'inactive' && professional.active) return false;
    return matchesSearch(search, professional.name, professional.email, professional.phone);
  });
  const activeCount = professionals.filter((p) => p.active).length;
  const teamRevenue = professionals.reduce((sum, p) => sum + p.production.revenue, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Profissionais"
        description={`${activeCount} ${activeCount === 1 ? 'profissional ativo' : 'profissionais ativos'} · ${formatCurrencyBRL(teamRevenue)} produzidos no mês.`}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Novo profissional
          </Button>
        }
      />

      <ListToolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar profissional" />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: 'Ativos' },
            { value: 'inactive', label: 'Inativos' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Surface>
          <EmptyState
            icon={UserRoundIcon}
            title={
              professionals.length === 0
                ? 'Nenhum profissional cadastrado'
                : 'Nenhum profissional encontrado'
            }
            description={
              professionals.length === 0
                ? 'Cadastre sua equipe pra começar a montar a agenda.'
                : 'Ajuste a busca ou o filtro.'
            }
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((professional, index) => {
            const share = teamRevenue > 0 ? professional.production.revenue / teamRevenue : 0;
            const estimatedCommission =
              professional.commissionType === 'PERCENTAGE' && professional.commissionValue !== null
                ? (professional.production.revenue * professional.commissionValue) / 100
                : null;
            return (
              <AppleTile
                key={professional.id}
                index={index % 6}
                className="flex cursor-pointer flex-col gap-5"
              >
                <button
                  type="button"
                  onClick={() => openEdit(professional)}
                  className="focus-visible:ring-ring/50 absolute inset-0 z-0 rounded-[22px] outline-none focus-visible:ring-2"
                  aria-label={`Editar ${professional.name}`}
                />
                <div className="pointer-events-none relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <InitialsAvatar
                      name={professional.name}
                      color={professional.color}
                      className="size-11 text-[14px]"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                          {professional.name}
                        </span>
                        {!professional.active && <Badge variant="outline">Inativo</Badge>}
                      </div>
                      <div className="text-label-secondary truncate text-[13px]">
                        {professional.email || professional.phone || 'Sem contato'}
                      </div>
                    </div>
                  </div>
                  <div className="pointer-events-auto relative z-10">
                    <Switch
                      checked={professional.active}
                      onCheckedChange={(checked: boolean) =>
                        toggleActive.mutate({ id: professional.id, active: checked })
                      }
                      aria-label="Ativo"
                    />
                  </div>
                </div>

                <div className="pointer-events-none relative grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-label-secondary text-[12px]">Atendimentos</div>
                    <div className="text-[15px] font-semibold tabular-nums">
                      {professional.production.appointmentCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-label-secondary text-[12px]">Produção</div>
                    <div className="truncate text-[15px] font-semibold tabular-nums">
                      {formatCurrencyBRL(professional.production.revenue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-label-secondary text-[12px]">Comissão</div>
                    <div className="truncate text-[15px] font-semibold tabular-nums">
                      {formatCommission(professional)}
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none relative">
                  <div className="text-label-secondary mb-1.5 flex justify-between text-[12px]">
                    <span>Participação no faturamento do mês</span>
                    <span className="tabular-nums">{Math.round(share * 100)}%</span>
                  </div>
                  <div className="bg-foreground/[0.08] h-1.5 overflow-hidden rounded-full">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: professional.color }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${share * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                    />
                  </div>
                  {estimatedCommission !== null && (
                    <div className="text-label-secondary mt-2 text-[12px]">
                      Comissão estimada no mês:{' '}
                      <span className="text-foreground font-medium tabular-nums">
                        {formatCurrencyBRL(estimatedCommission)}
                      </span>
                    </div>
                  )}
                </div>
              </AppleTile>
            );
          })}
        </div>
      )}

      <ProfessionalDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        professional={editingProfessional}
      />
    </div>
  );
}
