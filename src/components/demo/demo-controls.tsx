'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { useMutation } from '@tanstack/react-query';
import { FlaskConicalIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { leaveDemoCompanyAction, openDemoCompanyAction } from '@/server/actions/demo-actions';

/** Troca a empresa ativa no Clerk e recarrega o painel já nela. */
function useSwitchCompany() {
  const { setActive } = useClerk();
  const router = useRouter();
  return async (organizationId: string | null) => {
    await setActive({ organization: organizationId });
    router.push(organizationId ? '/dashboard' : '/onboarding');
    router.refresh();
  };
}

/** Configurações: criar (ou reabrir) a empresa de demonstração. */
export function OpenDemoCard() {
  const switchCompany = useSwitchCompany();
  const open = useMutation({
    mutationFn: () => openDemoCompanyAction().then(unwrapResult),
    onSuccess: async ({ organizationId }) => {
      toast.success('Demonstração pronta. Abrindo…');
      await switchCompany(organizationId);
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível criar a demonstração.'),
  });

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-start gap-3">
        <span className="bg-system-indigo/12 text-system-indigo flex size-9 shrink-0 items-center justify-center rounded-xl">
          <FlaskConicalIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold">Empresa de demonstração</h2>
          <p className="text-label-secondary text-[13px]">
            Uma empresa separada, com agenda cheia, clientes, estoque e faturamento fictícios. Serve
            para apresentar o sistema e testar à vontade — nada muda nesta empresa nem nos seus
            indicadores. Para voltar, use o seletor de empresa no topo.
          </p>
        </div>
      </div>
      <Button className="self-start" disabled={open.isPending} onClick={() => open.mutate()}>
        {open.isPending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" /> Preparando dados…
          </>
        ) : (
          'Abrir demonstração'
        )}
      </Button>
    </section>
  );
}

/** Faixa no topo de todas as telas da demonstração, para ninguém confundir com a empresa real. */
export function DemoBanner() {
  const switchCompany = useSwitchCompany();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const leave = useMutation({
    mutationFn: (remove: boolean) => leaveDemoCompanyAction({ remove }).then(unwrapResult),
    onSuccess: async ({ organizationId }, remove) => {
      if (remove) toast.success('Demonstração excluída.');
      setConfirmDelete(false);
      await switchCompany(organizationId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <div className="bg-system-indigo flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-[13px] text-white">
        <span className="flex items-center gap-1.5 font-medium">
          <FlaskConicalIcon className="size-4" />
          Empresa de demonstração · dados fictícios
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            disabled={leave.isPending}
            onClick={() => leave.mutate(false)}
          >
            Voltar à minha empresa
          </button>
          <button
            type="button"
            className="text-white/80 underline underline-offset-2"
            disabled={leave.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Excluir demonstração
          </button>
        </span>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir a demonstração?"
        description="A empresa de demonstração e todos os dados fictícios somem. Sua empresa real não é afetada. Você pode criar outra quando quiser."
        confirmLabel={leave.isPending ? 'Excluindo…' : 'Excluir'}
        destructive
        pending={leave.isPending}
        onConfirm={() => leave.mutate(true)}
        onOpenChange={setConfirmDelete}
      />
    </>
  );
}
