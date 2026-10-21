'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listClientsAction } from '@/server/actions/client-actions';
import {
  cancelReferralAction,
  createReferralAction,
  grantReferralRewardAction,
  listReferralsAction,
} from '@/server/actions/referral-actions';

const STATUS = {
  PENDING: { label: 'Aguardando condição', tone: 'text-label-secondary' },
  QUALIFIED: { label: 'Condição cumprida — recompensa liberada', tone: 'text-system-green' },
  REWARDED: { label: 'Recompensado', tone: 'text-system-blue' },
  CANCELED: { label: 'Cancelada', tone: 'text-label-secondary' },
} as const;
const CONDITION = {
  first_appointment_done: 'primeiro atendimento concluído',
  first_payment: 'primeiro pagamento recebido',
} as const;

/** Programa de indicações: condição, status e recompensa registrada (Profissional+). */
export function ReferralProgram() {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => listReferralsAction().then(unwrapResult),
  });
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({
    referrerId: '',
    referredId: '',
    condition: 'first_appointment_done',
    reward: '',
  });
  const [granting, setGranting] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsAction,
    enabled: adding,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['referrals'] });
  const create = useMutation({
    mutationFn: () =>
      createReferralAction({
        referrerId: form.referrerId,
        referredId: form.referredId,
        condition: form.condition,
        rewardDescription: form.reward || null,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Indicação registrada.');
      setAdding(false);
      setForm({ referrerId: '', referredId: '', condition: 'first_appointment_done', reward: '' });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const grant = useMutation({
    mutationFn: (id: string) => grantReferralRewardAction({ id, note }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Recompensa registrada.');
      setGranting(null);
      setNote('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      cancelReferralAction({ id, reason: 'Cancelada pela equipe' }).then(unwrapResult),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const options: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }));

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Programa de indicações</h2>
          <p className="text-label-secondary text-[13px]">
            A recompensa só é liberada quando a condição é cumprida. Se o atendimento for cancelado
            ou o pagamento estornado antes, volta a aguardar. O benefício concedido fica registrado.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon /> Registrar indicação
        </Button>
      </div>
      {adding && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Combobox
            options={options}
            value={form.referrerId}
            onChange={(v) => setForm((f) => ({ ...f, referrerId: v }))}
            placeholder="Quem indicou"
          />
          <Combobox
            options={options}
            value={form.referredId}
            onChange={(v) => setForm((f) => ({ ...f, referredId: v }))}
            placeholder="Quem foi indicado"
          />
          <Select
            value={form.condition}
            onValueChange={(v: string) => setForm((f) => ({ ...f, condition: v }))}
          >
            <SelectTrigger className="w-full" aria-label="Condição">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_appointment_done">
                Condição: primeiro atendimento concluído
              </SelectItem>
              <SelectItem value="first_payment">Condição: primeiro pagamento recebido</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Recompensa combinada (ex.: 10% no próximo serviço)"
            maxLength={200}
            value={form.reward}
            onChange={(e) => setForm((f) => ({ ...f, reward: e.target.value }))}
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              disabled={!form.referrerId || !form.referredId || create.isPending}
            >
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="text-label-secondary text-[13px]">Nenhuma indicação no programa ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-background/60 flex flex-col gap-1 rounded-xl px-3 py-2 text-[14px]"
            >
              <div>
                <Link href={`/clientes/${r.referrer.id}`} className="font-medium hover:underline">
                  {r.referrer.name}
                </Link>{' '}
                indicou{' '}
                <Link href={`/clientes/${r.referred.id}`} className="font-medium hover:underline">
                  {r.referred.name}
                </Link>
              </div>
              <div className="text-[12px]">
                <span className={STATUS[r.status].tone}>{STATUS[r.status].label}</span>
                <span className="text-label-secondary">
                  {' '}
                  · condição: {CONDITION[r.condition]}
                  {r.rewardDescription && ` · combinado: ${r.rewardDescription}`}
                  {r.rewardNote && ` · concedido: ${r.rewardNote}`}
                </span>
              </div>
              {r.status === 'QUALIFIED' &&
                (granting === r.id ? (
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      grant.mutate(r.id);
                    }}
                  >
                    <Input
                      className="min-w-0 flex-1"
                      autoFocus
                      maxLength={300}
                      placeholder="O que foi concedido (ex.: cupom AMIGO10 criado)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={!note.trim() || grant.isPending}>
                      Registrar
                    </Button>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => setGranting(r.id)}
                  >
                    Registrar recompensa
                  </Button>
                ))}
              {(r.status === 'PENDING' || r.status === 'QUALIFIED') && (
                <button
                  type="button"
                  className="text-label-secondary self-start text-[12px] hover:underline"
                  onClick={() => cancel.mutate(r.id)}
                >
                  Cancelar indicação
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
