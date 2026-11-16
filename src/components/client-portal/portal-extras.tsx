'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardListIcon,
  FileTextIcon,
  HourglassIcon,
  PackageIcon,
  ChevronRightIcon,
  RepeatIcon,
  SparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { QuoteBody } from '@/components/orcamentos/public-quote';
import {
  getMyDocumentAction,
  openMyFormAction,
  respondMyOfferAction,
  respondMyQuoteAction,
  updateMyProfileAction,
} from '@/server/actions/client-portal-actions';
import type { PortalExtras } from '@/server/data/client-portal';

type Quote = PortalExtras['quotes'][number];
type Doc =
  Awaited<ReturnType<typeof getMyDocumentAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

function fmt(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, ...opts }).format(new Date(iso));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Área do cliente ampliada: convites de vaga, fichas a preencher, pacotes, orçamentos,
 * documentos liberados e dados do cadastro. Tudo do próprio cliente; nada interno da equipe.
 */
export function PortalExtrasSections({
  extras,
  timezone,
}: {
  extras: PortalExtras;
  timezone: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [doc, setDoc] = React.useState<Doc | null>(null);
  // Foto do registro aberta numa janela por cima da página (sem levar o cliente para o link).
  const [photoView, setPhotoView] = React.useState<{ urls: string[]; index: number } | null>(null);
  const done = (message: string) => {
    toast.success(message);
    router.refresh();
  };
  const fail = (error: Error) => toast.error(error.message, { duration: 8000 });

  const offer = useMutation({
    mutationFn: (input: { id: string; accept: boolean }) =>
      respondMyOfferAction(input).then(unwrapResult),
    onSuccess: (r) =>
      done(r.appointmentId ? 'Horário confirmado!' : 'Tudo bem, avisamos a equipe.'),
    onError: fail,
  });
  const openForm = useMutation({
    mutationFn: (id: string) => openMyFormAction(id).then(unwrapResult),
    onSuccess: (r) => router.push(r.url),
    onError: fail,
  });
  const openDoc = useMutation({
    mutationFn: (id: string) => getMyDocumentAction(id).then(unwrapResult),
    onSuccess: setDoc,
    onError: fail,
  });
  const respondQuote = useMutation({
    mutationFn: (input: { approve: boolean }) =>
      respondMyQuoteAction(
        input.approve
          ? {
              id: quote!.id,
              approve: true,
              version: quote!.version,
              contentHash: quote!.contentHash,
            }
          : { id: quote!.id, approve: false },
      ).then(unwrapResult),
    onSuccess: (_r, input) => {
      setQuote(null);
      done(
        input.approve ? 'Orçamento aprovado. A empresa vai falar com você.' : 'Resposta enviada.',
      );
    },
    onError: fail,
  });

  return (
    <>
      {extras.offers.length > 0 && (
        <Section title="Vaga para você">
          {extras.offers.map((o) => (
            <div
              key={o.id}
              className="border-system-orange/30 bg-system-orange/[0.06] flex flex-col gap-2 rounded-[22px] border p-4"
            >
              <div className="flex items-center gap-2 text-[15px] font-medium">
                <HourglassIcon className="text-system-orange size-4" />
                {o.service}
              </div>
              <div className="text-[15px]">
                {fmt(o.startAt, timezone, {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-label-secondary text-[13px]">
                Guardamos este horário para você até{' '}
                {fmt(o.expiresAt, timezone, { hour: '2-digit', minute: '2-digit' })}.
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={offer.isPending}
                  onClick={() => offer.mutate({ id: o.id, accept: true })}
                >
                  Quero este horário
                </Button>
                <Button
                  variant="ghost"
                  disabled={offer.isPending}
                  onClick={() => offer.mutate({ id: o.id, accept: false })}
                >
                  Não posso
                </Button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {extras.forms.toFill.length > 0 && (
        <Section title="Fichas para preencher">
          <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
            {extras.forms.toFill.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <ClipboardListIcon className="text-system-blue size-5 shrink-0" />
                <div className="min-w-0 flex-1 truncate text-[15px] font-medium">{f.name}</div>
                <Button
                  size="sm"
                  disabled={openForm.isPending}
                  onClick={() => openForm.mutate(f.id)}
                >
                  {f.started ? 'Continuar' : 'Preencher'}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {extras.records.length > 0 && (
        <Section title="Minha evolução">
          {extras.records.map((block, index) => (
            // Recolhível: só o mais recente começa aberto (com muitas fotos a página ficaria enorme).
            <details
              key={block.id}
              open={index === 0}
              className="bg-tile group flex flex-col gap-3 rounded-[22px] p-4"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon className="text-label-secondary size-4 transition-transform group-open:rotate-90" />
                <SparklesIcon className="text-system-indigo size-4" />
                <span className="min-w-0 truncate">{block.title}</span>
                <span className="text-label-secondary shrink-0 text-[12px] font-normal">
                  · {block.entries.length} {block.entries.length === 1 ? 'dia' : 'dias'}
                </span>
              </summary>
              <ol className="border-foreground/[0.08] mt-3 flex flex-col gap-3 border-l-2 pl-3">
                {block.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold tabular-nums">
                      {entry.date.split('-').reverse().join('/')}
                    </span>
                    {entry.notes && (
                      <p className="text-[14px] whitespace-pre-wrap">{entry.notes}</p>
                    )}
                    {entry.photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {entry.photos
                          .filter((p) => p.url)
                          .map((photo, photoIndex, list) => (
                            <button
                              key={photo.id}
                              type="button"
                              aria-label="Ver foto"
                              onClick={() =>
                                setPhotoView({ urls: list.map((p) => p.url!), index: photoIndex })
                              }
                              className="aspect-square overflow-hidden rounded-xl bg-black/5"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- link temporário */}
                              <img
                                src={photo.url!}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          ))}
          <PhotoViewer view={photoView} onChange={setPhotoView} />
        </Section>
      )}

      {extras.subscriptions.length > 0 && (
        <Section title="Meus planos">
          {extras.subscriptions.map((p) => (
            <div key={p.id} className="bg-tile flex flex-col gap-2 rounded-[22px] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  <RepeatIcon className="text-system-green size-4" />
                  {p.name}
                </span>
                <span className="text-label-secondary text-[13px] tabular-nums">
                  {formatCurrencyBRL(p.price)}/mês
                </span>
              </div>
              <div
                className="bg-foreground/[0.08] h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={p.done}
                aria-valuemax={p.total}
                aria-label={`${p.done} de ${p.total} sessões neste mês`}
              >
                <div
                  className="bg-system-green h-full rounded-full"
                  style={{ width: `${Math.min(100, (p.done / Math.max(p.total, 1)) * 100)}%` }}
                />
              </div>
              <div className="text-label-secondary text-[13px]">
                Este mês: {p.done} de {p.total} sessões · {p.remaining} disponíve
                {p.remaining === 1 ? 'l' : 'is'}
                {p.renewsOn &&
                  ` · renova em ${fmt(p.renewsOn, timezone, { day: '2-digit', month: '2-digit' })}`}
              </div>
            </div>
          ))}
        </Section>
      )}

      {extras.packages.length > 0 && (
        <Section title="Pacotes">
          {extras.packages.map((p) => (
            <div key={p.id} className="bg-tile flex flex-col gap-2 rounded-[22px] p-4">
              <div className="flex items-center gap-2 text-[15px] font-medium">
                <PackageIcon className="text-system-indigo size-4" />
                {p.name}
              </div>
              <div
                className="bg-foreground/[0.08] h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={p.done}
                aria-valuemax={p.total}
                aria-label={`${p.done} de ${p.total} sessões`}
              >
                <div
                  className="bg-system-indigo h-full rounded-full"
                  style={{ width: `${Math.min(100, (p.done / Math.max(p.total, 1)) * 100)}%` }}
                />
              </div>
              <div className="text-label-secondary text-[13px]">
                {p.done} de {p.total} sessões · {p.remaining} restante{p.remaining === 1 ? '' : 's'}
                {p.validUntil &&
                  ` · válido até ${fmt(p.validUntil, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
              </div>
            </div>
          ))}
        </Section>
      )}

      {extras.quotes.length > 0 && (
        <Section title="Orçamentos">
          <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
            {extras.quotes.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setQuote(q)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{q.title}</div>
                    <div className="text-label-secondary text-[13px]">
                      {QUOTE_STATUS_LABEL[q.status]}
                      {q.status === 'SENT' && ' · aguardando sua resposta'}
                    </div>
                  </div>
                  <span className="text-[15px] tabular-nums">{formatCurrencyBRL(q.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {extras.forms.documents.length > 0 && (
        <Section title="Documentos">
          <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
            {extras.forms.documents.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={openDoc.isPending}
                  onClick={() => openDoc.mutate(d.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <FileTextIcon className="text-label-secondary size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{d.name}</div>
                    {d.submittedAt && (
                      <div className="text-label-secondary text-[13px]">
                        {fmt(d.submittedAt, timezone, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {extras.jobs.length > 0 && (
        <Section title="Serviços em andamento">
          {extras.jobs.map((j) => (
            <div key={j.id} className="bg-tile flex flex-col gap-1 rounded-[22px] p-4">
              <div className="text-[15px] font-medium">{j.title}</div>
              <div className="text-label-secondary text-[13px]">
                {j.done ? 'Concluído' : `Etapa: ${j.stage}`}
                {j.dueAt &&
                  !j.done &&
                  ` · previsão ${fmt(j.dueAt, timezone, { day: '2-digit', month: '2-digit' })}`}
              </div>
              {j.note && <p className="text-[14px]">{j.note}</p>}
            </div>
          ))}
        </Section>
      )}

      {extras.pendingPayments.length > 0 && (
        <Section title="Pagamentos em aberto">
          <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
            {extras.pendingPayments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{p.description}</div>
                  {p.dueDate && (
                    <div className="text-label-secondary text-[13px]">
                      vence {fmt(p.dueDate, timezone, { day: '2-digit', month: '2-digit' })}
                    </div>
                  )}
                </div>
                <span className="text-[15px] tabular-nums">{formatCurrencyBRL(p.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-label-secondary text-[12px]">
            Para pagar, fale com o estabelecimento. O pagamento só aparece como feito depois que a
            equipe registrar o recebimento.
          </p>
        </Section>
      )}

      <ProfileSection profile={extras.profile} />

      <Drawer open={quote !== null} onOpenChange={(o: boolean) => !o && setQuote(null)}>
        <DrawerContent className="max-h-[92dvh]">
          {quote && (
            <>
              <DrawerHeader>
                <DrawerTitle>{quote.title}</DrawerTitle>
                <DrawerDescription>
                  Orçamento #{quote.number} · {QUOTE_STATUS_LABEL[quote.status]}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
                <QuoteBody quote={quote} />
                {quote.status === 'SENT' && (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="lg"
                      disabled={respondQuote.isPending}
                      onClick={() => respondQuote.mutate({ approve: true })}
                    >
                      Aprovar {formatCurrencyBRL(quote.total)}
                    </Button>
                    <p className="text-label-secondary text-center text-[12px]">
                      Aprovar não gera cobrança automática: o pagamento é combinado com a empresa.
                    </p>
                    <Button
                      variant="ghost"
                      disabled={respondQuote.isPending}
                      onClick={() => respondQuote.mutate({ approve: false })}
                    >
                      Não quero
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={doc !== null} onOpenChange={(o: boolean) => !o && setDoc(null)}>
        <DrawerContent className="max-h-[92dvh]">
          {doc && (
            <>
              <DrawerHeader>
                <DrawerTitle>{doc.name}</DrawerTitle>
                {doc.submittedAt && (
                  <DrawerDescription>
                    Enviada em{' '}
                    {fmt(doc.submittedAt, timezone, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </DrawerDescription>
                )}
              </DrawerHeader>
              <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
                {doc.sections.map((section, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    {section.title && (
                      <h3 className="text-[15px] font-semibold">{section.title}</h3>
                    )}
                    <dl className="flex flex-col gap-2">
                      {section.rows.map((row, j) => (
                        <div key={j}>
                          <dt className="text-label-secondary text-[13px]">{row.label}</dt>
                          <dd className="text-[15px] whitespace-pre-line">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ProfileSection({ profile }: { profile: PortalExtras['profile'] }) {
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState(() => ({
    email: profile.email ?? '',
    birthDate: profile.birthDate ?? '',
    zipCode: profile.zipCode ?? '',
    street: profile.street ?? '',
    number: profile.number ?? '',
    complement: profile.complement ?? '',
    district: profile.district ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
  }));
  const save = useMutation({
    mutationFn: () => updateMyProfileAction(form).then(unwrapResult),
    onSuccess: () => {
      toast.success('Dados atualizados.');
      setEditing(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const field = (
    key: keyof typeof form,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="text-label-secondary">{label}</span>
      <Input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        {...props}
      />
    </label>
  );
  return (
    <Section title="Meus dados">
      {editing ? (
        <form
          className="bg-tile flex flex-col gap-3 rounded-[22px] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {field('email', 'E-mail', { type: 'email', autoComplete: 'email', maxLength: 200 })}
          {field('birthDate', 'Data de nascimento', { type: 'date' })}
          <div className="grid grid-cols-2 gap-2">
            {field('zipCode', 'CEP', { inputMode: 'numeric', maxLength: 9 })}
            {field('number', 'Número', { maxLength: 20 })}
          </div>
          {field('street', 'Rua', { maxLength: 200 })}
          {field('complement', 'Complemento', { maxLength: 100 })}
          {field('district', 'Bairro', { maxLength: 100 })}
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            {field('city', 'Cidade', { maxLength: 100 })}
            {field('state', 'UF', { maxLength: 2 })}
          </div>
          <p className="text-label-secondary text-[12px]">
            Nome e telefone são alterados pela equipe, por segurança.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEditing(true)}>
          Atualizar e-mail, aniversário e endereço
        </Button>
      )}
    </Section>
  );
}

/** Foto em tela cheia dentro da área do cliente, com setas para as outras fotos do dia. */
function PhotoViewer({
  view,
  onChange,
}: {
  view: { urls: string[]; index: number } | null;
  onChange: (view: { urls: string[]; index: number } | null) => void;
}) {
  const go = (delta: number) =>
    view &&
    onChange({
      urls: view.urls,
      index: (view.index + delta + view.urls.length) % view.urls.length,
    });
  return (
    <Dialog open={view !== null} onOpenChange={(open: boolean) => !open && onChange(null)}>
      <DialogContent className="gap-2 p-2 sm:max-w-3xl">
        <DialogTitle className="sr-only">Foto</DialogTitle>
        {view && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- link temporário e privado */}
            <img
              src={view.urls[view.index]}
              alt="Foto do seu tratamento"
              className="max-h-[75vh] w-full rounded-2xl object-contain"
              onContextMenu={(e) => e.preventDefault()}
            />
            {view.urls.length > 1 && (
              <div className="flex items-center justify-between px-2 pb-1">
                <Button variant="ghost" size="sm" onClick={() => go(-1)}>
                  ‹ Anterior
                </Button>
                <span className="text-label-secondary text-[13px] tabular-nums">
                  {view.index + 1} de {view.urls.length}
                </span>
                <Button variant="ghost" size="sm" onClick={() => go(1)}>
                  Próxima ›
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
