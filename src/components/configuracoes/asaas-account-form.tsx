'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { unwrapResult } from '@/lib/action-result';
import { createAsaasAccountAction } from '@/server/actions/deposit-actions';

const COMPANY_TYPES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'LIMITED', label: 'Limitada (LTDA)' },
  { value: 'INDIVIDUAL', label: 'Individual (EI)' },
  { value: 'ASSOCIATION', label: 'Associação' },
] as const;

const EMPTY = {
  name: '',
  email: '',
  cpfCnpj: '',
  birthDate: '',
  companyType: 'MEI',
  mobilePhone: '',
  incomeValue: '',
  postalCode: '',
  address: '',
  addressNumber: '',
  complement: '',
  province: '',
};

/** Cria a conta Asaas do negócio sem sair do Atendafy (subconta da plataforma). */
export function AsaasAccountForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = React.useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const isCpf = form.cpfCnpj.replace(/\D/g, '').length <= 11;

  // Preenche rua e bairro pelo CEP (ViaCEP); se falhar, a pessoa digita.
  const lookupCep = async () => {
    const cep = form.postalCode.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const json = (await r.json()) as { logradouro?: string; bairro?: string; erro?: boolean };
      if (json.erro) return;
      setForm((f) => ({
        ...f,
        address: f.address || json.logradouro || '',
        province: f.province || json.bairro || '',
      }));
    } catch {
      // Sem internet ou ViaCEP fora do ar: segue manual.
    }
  };

  const create = useMutation({
    mutationFn: () =>
      createAsaasAccountAction({
        name: form.name,
        email: form.email,
        cpfCnpj: form.cpfCnpj,
        ...(isCpf ? { birthDate: form.birthDate || undefined } : { companyType: form.companyType }),
        mobilePhone: form.mobilePhone,
        incomeValue: Number(form.incomeValue.replace(/\./g, '').replace(',', '.')) || 0,
        postalCode: form.postalCode,
        address: form.address,
        addressNumber: form.addressNumber,
        complement: form.complement || undefined,
        province: form.province,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success(
        'Conta Asaas criada e conectada. Abra o e-mail da Asaas para criar a senha e enviar os documentos.',
      );
      setForm(EMPTY);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="border-foreground/[0.1] flex flex-col gap-3 rounded-2xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div>
        <h3 className="text-[15px] font-semibold">Criar sua conta Asaas por aqui</h3>
        <p className="text-label-secondary text-[13px]">
          Sem sair do Atendafy. A conta é sua, no seu CPF ou CNPJ, e todo pagamento cai nela. Depois
          a Asaas manda um e-mail para você criar a senha e enviar os documentos.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nome ou razão social" value={form.name} onChange={set('name')} />
        <Input type="email" placeholder="E-mail" value={form.email} onChange={set('email')} />
        <Input
          placeholder="CPF ou CNPJ"
          inputMode="numeric"
          value={form.cpfCnpj}
          onChange={set('cpfCnpj')}
        />
        {isCpf ? (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-label-secondary shrink-0">Nascimento</span>
            <Input type="date" value={form.birthDate} onChange={set('birthDate')} />
          </label>
        ) : (
          <SegmentedControl
            size="sm"
            value={form.companyType}
            onValueChange={(v: string) => setForm((f) => ({ ...f, companyType: v }))}
            options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        )}
        <Input
          placeholder="Celular com DDD"
          inputMode="tel"
          value={form.mobilePhone}
          onChange={set('mobilePhone')}
        />
        <Input
          placeholder="Faturamento mensal aproximado (R$)"
          inputMode="decimal"
          value={form.incomeValue}
          onChange={set('incomeValue')}
        />
        <Input
          placeholder="CEP"
          inputMode="numeric"
          value={form.postalCode}
          onChange={set('postalCode')}
          onBlur={lookupCep}
        />
        <Input placeholder="Rua" value={form.address} onChange={set('address')} />
        <Input placeholder="Número" value={form.addressNumber} onChange={set('addressNumber')} />
        <Input
          placeholder="Complemento (opcional)"
          value={form.complement}
          onChange={set('complement')}
        />
        <Input placeholder="Bairro" value={form.province} onChange={set('province')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Criando conta...' : 'Criar conta Asaas'}
        </Button>
        <span className="text-label-secondary text-[12px]">
          A Asaas cobra R$ 1,99 por PIX recebido. O Atendafy não fica com nada dos pagamentos.
        </span>
      </div>
    </form>
  );
}
