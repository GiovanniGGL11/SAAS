import { redirect } from 'next/navigation';

/** Endereço antigo: os orçamentos agora ficam em Comercial. */
export default async function OrcamentosRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; novo?: string }>;
}) {
  const { id, novo } = await searchParams;
  const params = new URLSearchParams({ aba: 'orcamentos' });
  if (id) params.set('id', id.slice(0, 64));
  if (novo) params.set('novo', novo.slice(0, 64));
  redirect(`/comercial?${params.toString()}`);
}
