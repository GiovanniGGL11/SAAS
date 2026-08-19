'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
          <p className="text-muted-foreground text-sm">Equipe, comissões e produção do mês.</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Novo profissional
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profissional</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Comissão</TableHead>
              <TableHead>Produção (mês)</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {professionals.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  Nenhum profissional cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {professionals.map((professional) => (
              <TableRow
                key={professional.id}
                className="cursor-pointer"
                onClick={() => openEdit(professional)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: professional.color }}
                    />
                    <span className="font-medium">{professional.name}</span>
                    {!professional.active && <Badge variant="outline">Inativo</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {professional.email || professional.phone || '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCommission(professional)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {professional.production.appointmentCount} atend. ·{' '}
                  {formatCurrencyBRL(professional.production.revenue)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={professional.active}
                    onCheckedChange={(checked: boolean) =>
                      toggleActive.mutate({ id: professional.id, active: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ProfessionalDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        professional={editingProfessional}
      />
    </div>
  );
}
