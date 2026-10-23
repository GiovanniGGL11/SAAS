'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { priceLabel } from '@/lib/catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/layout/page';
import { OnlineBookingCard } from '@/components/configuracoes/online-booking-card';
import { PublicProfileCard } from '@/components/configuracoes/public-profile-card';
import { DepositCard } from '@/components/configuracoes/deposit-card';
import { ClientAreaCard } from '@/components/configuracoes/client-area-card';
import { GoogleReviewCard } from '@/components/configuracoes/google-review-card';
import { setServicePublicVisibleAction } from '@/server/actions/service-actions';

const TABS = [
  { value: 'visao', label: 'Visão geral' },
  { value: 'agendamento', label: 'Agendamento' },
  { value: 'servicos', label: 'Serviços no link' },
  { value: 'pagina', label: 'Página' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'area', label: 'Área do cliente' },
  { value: 'avaliacoes', label: 'Avaliações' },
] as const;
export type ClientLinkTab = (typeof TABS)[number]['value'];

const STEP_LABEL: Record<number, string> = {
  15: 'a cada 15 min',
  30: 'a cada 30 min',
  60: 'a cada 1 hora',
  0: 'pela duração do serviço',
};
const LEAD_LABEL: Record<number, string> = {
  0: 'sem antecedência mínima',
  30: '30 min de antecedência',
  60: '1 hora de antecedência',
  120: '2 horas de antecedência',
  240: '4 horas de antecedência',
  1440: '1 dia de antecedência',
};

export type ClientLinkService = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceKind: string;
  publicVisible: boolean;
};

export type ClientLinkData = {
  companyName: string;
  bookingUrl: string;
  entryUrl: string;
  enabled: boolean;
  slotStep: number;
  leadMinutes: number;
  withoutSchedule: string[];
  hasLogo: boolean;
  profile: {
    zipCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    instagram: string | null;
    cancellationPolicy: string | null;
  };
  whatsapp: string | null;
  googleReviewUrl: string | null;
  deposit: { connected: boolean; percent: number; required: boolean };
  services: ClientLinkService[];
};

/**
 * Tudo o que o cliente vê, num lugar só: o link de agendamento (com QR code para imprimir), como
 * os horários aparecem, quais serviços entram, a página, o pagamento adiantado, a área do cliente
 * e a avaliação no Google. Cada aba reaproveita o mesmo cartão de antes.
 */
export function ClientLinkView({
  data,
  initialTab,
}: {
  data: ClientLinkData;
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<ClientLinkTab>(
    TABS.some((t) => t.value === initialTab) ? (initialTab as ClientLinkTab) : 'visao',
  );
  function changeTab(next: ClientLinkTab) {
    setTab(next);
    // A aba fica no endereço; ao voltar para a visão geral, o resumo é recarregado.
    const url = new URL(window.location.href);
    if (next === 'visao') {
      url.searchParams.delete('aba');
      router.refresh();
    } else url.searchParams.set('aba', next);
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Link do cliente"
        description="Tudo o que o seu cliente vê: o link para agendar sozinho, a página, os serviços, o pagamento adiantado, a área do cliente e as avaliações."
      />
      <SegmentedControl
        className="self-start"
        value={tab}
        onValueChange={changeTab}
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />

      {tab === 'visao' && <Overview data={data} goTo={changeTab} />}
      {tab === 'agendamento' && (
        <OnlineBookingCard
          initialEnabled={data.enabled}
          initialSlotStep={data.slotStep}
          initialLeadMinutes={data.leadMinutes}
          withoutSchedule={data.withoutSchedule}
          url={data.bookingUrl}
        />
      )}
      {tab === 'servicos' && <ServicesInLink services={data.services} />}
      {tab === 'pagina' && <PublicProfileCard hasLogo={data.hasLogo} initial={data.profile} />}
      {tab === 'pagamento' && <DepositCard />}
      {tab === 'area' && (
        <ClientAreaCard initialWhatsapp={data.whatsapp} entryUrl={data.entryUrl} />
      )}
      {tab === 'avaliacoes' && <GoogleReviewCard initialUrl={data.googleReviewUrl} />}
    </div>
  );
}

// ---- Visão geral ------------------------------------------------------------------------------

function Overview({ data, goTo }: { data: ClientLinkData; goTo: (t: ClientLinkTab) => void }) {
  const visible = data.services.filter((s) => s.publicVisible).length;
  const p = data.profile;
  const checks: {
    ok: boolean;
    label: string;
    hint: string;
    tab?: ClientLinkTab;
    href?: string;
    optional?: boolean;
  }[] = [
    {
      ok: data.enabled,
      label: 'Agendamento online ligado',
      hint: 'Sem isso o link mostra que o agendamento está indisponível.',
      tab: 'agendamento',
    },
    {
      ok: data.withoutSchedule.length === 0,
      label: 'Expediente de todos os profissionais',
      hint: data.withoutSchedule.length
        ? `${data.withoutSchedule.join(', ')} ainda sem expediente: não aparece${data.withoutSchedule.length > 1 ? 'm' : ''} no link.`
        : 'Todos aparecem no link com os horários cadastrados.',
      href: '/profissionais',
    },
    {
      ok: visible > 0,
      label: 'Serviços no link',
      hint: `${visible} de ${data.services.length} serviços aparecem para o cliente.`,
      tab: 'servicos',
    },
    {
      ok: Boolean(p.street && p.city),
      label: 'Endereço na página',
      hint: 'O cliente vê onde fica e abre o mapa com um toque.',
      tab: 'pagina',
    },
    {
      ok: data.hasLogo,
      label: 'Logo da empresa',
      hint: 'Aparece no topo da página de agendamento.',
      tab: 'pagina',
    },
    {
      ok: Boolean(p.cancellationPolicy?.trim()),
      label: 'Política de cancelamento',
      hint: 'Aparece antes de o cliente confirmar a reserva.',
      tab: 'pagina',
    },
    {
      ok: data.deposit.connected && data.deposit.percent > 0,
      label: 'Pagamento adiantado por PIX',
      hint:
        data.deposit.connected && data.deposit.percent > 0
          ? `${data.deposit.percent === 100 ? 'Valor total' : `${data.deposit.percent}%`}, ${data.deposit.required ? 'obrigatório' : 'o cliente escolhe'}.`
          : 'Reduz faltas: o cliente paga uma parte (ou tudo) ao marcar.',
      tab: 'pagamento',
      optional: true,
    },
    {
      ok: Boolean(data.googleReviewUrl),
      label: 'Avaliação no Google',
      hint: 'Depois do atendimento, o cliente é convidado a avaliar no Google.',
      tab: 'avaliacoes',
      optional: true,
    },
  ];
  const required = checks.filter((c) => !c.optional);
  const done = required.filter((c) => c.ok).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ShareCard data={data} />
      <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold">Pronto para divulgar?</h2>
          <span className="text-label-secondary text-[13px] tabular-nums">
            {done} de {required.length}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {checks.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => (c.tab ? goTo(c.tab) : undefined)}
                className={cn(
                  'hover:bg-foreground/[0.04] flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left',
                  !c.tab && 'cursor-default',
                )}
              >
                {c.ok ? (
                  <CheckCircle2Icon className="text-system-green mt-0.5 size-5 shrink-0" />
                ) : (
                  <CircleDashedIcon className="text-label-secondary mt-0.5 size-5 shrink-0" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14px] font-medium">
                    {c.label}
                    {c.optional && (
                      <span className="text-label-secondary ml-1.5 text-[11px] font-normal">
                        opcional
                      </span>
                    )}
                  </span>
                  <span className="text-label-secondary text-[12px]">{c.hint}</span>
                  {c.href && !c.ok && (
                    <Link href={c.href} className="text-system-blue text-[12px] hover:underline">
                      Ajustar em Profissionais
                    </Link>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-label-secondary border-foreground/[0.06] border-t pt-3 text-[12px]">
          Horários {STEP_LABEL[data.slotStep] ?? 'a cada 15 min'}, com{' '}
          {LEAD_LABEL[data.leadMinutes] ?? '1 hora de antecedência'}.{' '}
          <button
            type="button"
            className="text-system-blue hover:underline"
            onClick={() => goTo('agendamento')}
          >
            Mudar
          </button>
        </p>
      </section>
    </div>
  );
}

function ShareCard({ data }: { data: ClientLinkData }) {
  const { data: qr } = useQuery({
    queryKey: ['booking-qr', data.bookingUrl],
    queryFn: () => QRCode.toDataURL(data.bookingUrl, { margin: 1, width: 640 }),
    staleTime: Infinity,
  });
  const shareText = `Agende seu horário na ${data.companyName}: ${data.bookingUrl}`;
  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Seu link de agendamento</h2>
          <p className="text-label-secondary text-[13px]">
            Coloque na bio do Instagram, no WhatsApp e no Google. O cliente escolhe serviço,
            profissional e horário sozinho.
          </p>
        </div>
        <Badge variant="outline" className={data.enabled ? 'text-system-green' : ''}>
          {data.enabled ? 'Ligado' : 'Desligado'}
        </Badge>
      </div>
      <div className="bg-background ring-foreground/[0.06] rounded-xl p-3 ring-1">
        <code className="block truncate text-[13px]">{data.bookingUrl}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(data.bookingUrl);
            toast.success('Link copiado.');
          }}
        >
          <CopyIcon className="size-4" /> Copiar
        </Button>
        <Button variant="outline" asChild>
          <a href={data.bookingUrl} target="_blank" rel="noreferrer">
            <ExternalLinkIcon className="size-4" /> Ver como o cliente vê
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircleIcon className="size-4" /> Enviar pelo WhatsApp
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL)
          <img
            src={qr}
            alt="QR code do link de agendamento"
            width={148}
            height={148}
            className="rounded-xl bg-white p-1"
          />
        ) : (
          <div className="bg-foreground/[0.05] size-[148px] animate-pulse rounded-xl" />
        )}
        <div className="flex max-w-60 flex-col gap-2">
          <p className="text-label-secondary text-[13px]">
            Imprima e deixe no balcão ou na vitrine: o cliente aponta a câmera e agenda.
          </p>
          {qr && (
            <Button variant="outline" size="sm" className="self-start" asChild>
              <a href={qr} download={`qr-agendamento-${data.companyName}.png`}>
                <DownloadIcon className="size-4" /> Baixar QR code
              </a>
            </Button>
          )}
        </div>
      </div>
      {!data.enabled && (
        <p className="rounded-xl bg-[#ff9f0a]/12 px-4 py-3 text-[13px] text-[#8a4b00] dark:text-[#ffb340]">
          O agendamento online está desligado: quem abrir o link vê que está indisponível. Ligue na
          aba Agendamento.
        </p>
      )}
    </section>
  );
}

// ---- Serviços no link -------------------------------------------------------------------------

function ServicesInLink({ services }: { services: ClientLinkService[] }) {
  const [visible, setVisible] = React.useState(
    () => new Map(services.map((s) => [s.id, s.publicVisible])),
  );
  const toggle = useMutation({
    mutationFn: (v: { id: string; publicVisible: boolean }) =>
      setServicePublicVisibleAction(v).then(unwrapResult),
    onMutate: (v) => {
      const before = visible.get(v.id);
      setVisible((m) => new Map(m).set(v.id, v.publicVisible));
      return { before };
    },
    onError: (e: Error, v, ctx) => {
      setVisible((m) => new Map(m).set(v.id, ctx?.before ?? !v.publicVisible));
      toast.error(e.message || 'Não foi possível salvar.');
    },
  });
  const count = [...visible.values()].filter(Boolean).length;

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Serviços no link</h2>
        <p className="text-label-secondary text-[13px]">
          {count} de {services.length} aparecem para o cliente. Desligado = só a equipe agenda (ex.:
          avaliação interna, retoque). Preço, duração e &ldquo;a partir de&rdquo; se ajustam em{' '}
          <Link href="/servicos" className="text-system-blue hover:underline">
            Serviços
          </Link>
          .
        </p>
      </div>
      {services.length === 0 ? (
        <p className="text-label-secondary text-[14px]">
          Nenhum serviço ativo.{' '}
          <Link href="/servicos" className="text-system-blue hover:underline">
            Cadastre em Serviços
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-foreground/[0.06] flex flex-col divide-y">
          {services.map((s) => {
            const on = visible.get(s.id) ?? false;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate text-[14px] font-medium',
                      !on && 'text-label-secondary',
                    )}
                  >
                    {s.name}
                  </div>
                  <div className="text-label-secondary text-[12px]">
                    {s.durationMinutes} min · {priceLabel(s.price, s.priceKind)}
                  </div>
                </div>
                <span className="text-label-secondary hidden text-[12px] sm:inline">
                  {on ? 'No link' : 'Só a equipe'}
                </span>
                <Switch
                  checked={on}
                  disabled={toggle.isPending && toggle.variables?.id === s.id}
                  onCheckedChange={(next: boolean) =>
                    toggle.mutate({ id: s.id, publicVisible: next })
                  }
                  aria-label={`${s.name} aparece no link`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
