'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { setGoogleReviewUrlAction } from '@/server/actions/relationship-actions';

/** Link de avaliação do Google: mostrado a quem dá 4 ou 5 estrelas depois do atendimento. */
export function GoogleReviewCard({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = React.useState(initialUrl ?? '');
  const save = useMutation({
    mutationFn: () => setGoogleReviewUrlAction({ url }).then(unwrapResult),
    onSuccess: () => toast.success(url ? 'Link do Google salvo.' : 'Link do Google removido.'),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Avaliações no Google</h2>
        <p className="text-label-secondary text-[13px]">
          Quem avalia o atendimento com 4 ou 5 estrelas é convidado a avaliar também no Google.
          Pegue o link no seu Perfil da Empresa no Google (&ldquo;Pedir avaliações&rdquo;) e cole
          aqui.
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input
          className="min-w-64 flex-1"
          placeholder="https://g.page/r/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
        />
        <Button type="submit" variant="outline" disabled={save.isPending}>
          Salvar
        </Button>
      </form>
    </section>
  );
}
