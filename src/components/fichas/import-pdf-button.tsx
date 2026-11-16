'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileUpIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * "Importar ficha em PDF": envia a ficha que o estabelecimento já usa; a IA monta o modelo na
 * mesma ordem do papel e ele abre no editor para conferir.
 */
export function ImportPdfButton({
  variant = 'outline',
}: {
  variant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const toastId = toast.loading('Lendo a ficha… isso leva uns segundos.');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/fichas/importar', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Não foi possível importar a ficha.');
      toast.success('Ficha importada! Confira as perguntas e salve.', { id: toastId });
      router.push(`/fichas/modelos/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar a ficha.', {
        id: toastId,
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <Button variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />}
        {busy ? 'Lendo a ficha…' : 'Importar ficha em PDF'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </>
  );
}
