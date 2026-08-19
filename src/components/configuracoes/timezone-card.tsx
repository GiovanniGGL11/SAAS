'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateCompanyTimezoneAction } from '@/server/actions/company-actions';
import { BRAZIL_TIMEZONES } from '@/lib/validations/company';

export function TimezoneCard({ companyName, timezone }: { companyName: string; timezone: string }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (tz: string) => updateCompanyTimezoneAction({ timezone: tz }),
    onSuccess: () => {
      toast.success('Fuso horário atualizado.');
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-medium">Empresa</h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Nome e membros são gerenciados na aba &quot;Organização&quot; abaixo.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Nome</span>
          <span className="text-sm">{companyName}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Fuso horário</span>
          <Select
            value={timezone}
            disabled={mutation.isPending}
            onValueChange={(value: string) => mutation.mutate(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAZIL_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
