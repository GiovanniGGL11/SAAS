'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, ShieldIcon, UserXIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { anonymizeClientAction, exportClientDataAction } from '@/server/actions/privacy-actions';

/** LGPD na ficha do cliente (administradores): exportar os dados e anonimizar a pedido. */
export function ClientPrivacy({ clientId, clientName }: { clientId: string; clientName: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState('');
  const [deleteForms, setDeleteForms] = React.useState(false);

  const exportData = useMutation({
    mutationFn: () => exportClientDataAction({ clientId }).then(unwrapResult),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const slug = clientName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase();
      link.href = url;
      link.download = `dados-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo gerado. Entregue à própria pessoa por um canal seguro.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anonymize = useMutation({
    mutationFn: () =>
      anonymizeClientAction({ clientId, deleteForms, confirmation }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Cliente anonimizado.');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-start gap-3">
        <ShieldIcon className="text-label-secondary mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-[15px] font-semibold">Privacidade (LGPD)</h2>
          <p className="text-label-secondary text-[13px]">
            A pedido da própria pessoa: entregue uma cópia de tudo o que está guardado sobre ela ou
            anonimize o cadastro. Fica registrado no histórico de alterações.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          <DownloadIcon className="size-4" />
          {exportData.isPending ? 'Gerando…' : 'Exportar dados'}
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            setConfirmation('');
            setDeleteForms(false);
            setOpen(true);
          }}
        >
          <UserXIcon className="size-4" />
          Anonimizar cliente
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anonimizar {clientName}?</DialogTitle>
            <DialogDescription>Não tem volta.</DialogDescription>
          </DialogHeader>
          <ul className="text-label-secondary list-disc space-y-1 pl-5 text-[13px]">
            <li>
              Apaga nome, telefone, e-mail, CPF, endereço, nascimento, observações e campos
              personalizados.
            </li>
            <li>Os links do portal e das fichas param de funcionar.</li>
            <li>
              Os lançamentos financeiros ficam (obrigação fiscal), ligados a um cadastro sem nome.
            </li>
            <li>Não é possível com horário futuro marcado: cancele antes.</li>
          </ul>
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteForms}
              onChange={(e) => setDeleteForms(e.target.checked)}
            />
            <span>
              Apagar também as fichas (anamnese, questionários). Atenção: algumas profissões são
              obrigadas a guardar esses registros por anos.
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span>
              Para confirmar, digite <strong>ANONIMIZAR</strong>
            </span>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmation !== 'ANONIMIZAR' || anonymize.isPending}
              onClick={() => anonymize.mutate()}
            >
              {anonymize.isPending ? 'Anonimizando…' : 'Anonimizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
