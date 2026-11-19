'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, FileTextIcon, PrinterIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/layout/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { unwrapResult } from '@/lib/action-result';
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABEL,
  documentTemplate,
  type DocumentKind,
} from '@/lib/clinical-documents';
import { cn } from '@/lib/utils';
import {
  cancelDocumentAction,
  createDocumentAction,
  listDocumentsAction,
} from '@/server/actions/medical-record-actions';

/**
 * Prescrições, atestados, laudos e declarações. Emitir guarda o documento (não se edita depois)
 * e abre a versão para imprimir ou salvar em PDF. Errou? Anule e emita outro.
 */
export function DocumentsTab({
  clientId,
  patientName,
  timezone,
}: {
  clientId: string;
  patientName: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['clinical-documents', clientId],
    queryFn: () => listDocumentsAction(clientId).then(unwrapResult),
  });
  const [kind, setKind] = React.useState<DocumentKind | ''>('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [professionalId, setProfessionalId] = React.useState('');
  const [canceling, setCanceling] = React.useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = React.useState('');

  const chosenProfessional = professionalId || data?.defaultProfessionalId || '';
  const professional = data?.professionals.find((p) => p.id === chosenProfessional);

  const startKind = (next: DocumentKind) => {
    const now = new Date();
    const date = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(now);
    const time = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
    setKind(next);
    setTitle(DOCUMENT_LABEL[next]);
    setBody(documentTemplate(next, { patient: patientName, date, time }));
  };

  const create = useMutation({
    mutationFn: () =>
      createDocumentAction({
        clientId,
        kind,
        title,
        body,
        professionalId: chosenProfessional,
      }).then(unwrapResult),
    onSuccess: (doc) => {
      toast.success('Documento emitido.');
      setKind('');
      setTitle('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['clinical-documents', clientId] });
      window.open(`/imprimir/documento/${doc.id}`, '_blank');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () =>
      cancelDocumentAction({ clientId, id: canceling!.id, reason }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Documento anulado.');
      setCanceling(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['clinical-documents', clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <Skeleton className="h-64 rounded-[22px]" />;
  const when = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(d));

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3 p-4 md:p-5">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <FileTextIcon className="text-system-blue size-4" /> Novo documento
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {DOCUMENT_KINDS.map((k) => (
            <Button
              key={k}
              size="xs"
              variant={kind === k ? 'default' : 'outline'}
              onClick={() => startKind(k)}
            >
              {DOCUMENT_LABEL[k]}
            </Button>
          ))}
        </div>
        {kind && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium">Título</span>
                <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium">Profissional responsável</span>
                <Select
                  value={chosenProfessional}
                  onValueChange={(v: string) => setProfessionalId(v)}
                >
                  <SelectTrigger aria-label="Profissional responsável">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.professionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.registry ? ` · ${p.registry}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {professional && !professional.registry && (
                  <span className="text-system-orange text-[11px]">
                    Sem registro no conselho (CRO, CRM...). Cadastre em{' '}
                    <Link href="/profissionais" className="underline">
                      Profissionais
                    </Link>{' '}
                    para sair no documento.
                  </span>
                )}
              </label>
            </div>
            <Textarea
              rows={10}
              value={body}
              maxLength={20_000}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Texto do documento"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-label-secondary text-[12px]">
                Depois de emitido, o documento não se edita. Errou? Anule e emita outro.
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setKind('')}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={body.trim().length < 3 || !chosenProfessional || create.isPending}
                  onClick={() => create.mutate()}
                >
                  <PrinterIcon /> {create.isPending ? 'Emitindo...' : 'Emitir e imprimir'}
                </Button>
              </div>
            </div>
          </>
        )}
      </Surface>

      {data.documents.length === 0 ? (
        <p className="text-label-secondary py-6 text-center text-[14px]">
          Nenhum documento emitido ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.documents.map((doc) => (
            <li key={doc.id}>
              <Surface
                className={cn(
                  'flex flex-wrap items-center gap-3 p-4',
                  doc.canceledAt && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {doc.title}
                    {doc.canceledAt && (
                      <span className="bg-system-red/10 text-system-red ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        Anulado
                      </span>
                    )}
                  </p>
                  <p className="text-label-secondary text-[12px]">
                    {DOCUMENT_LABEL[doc.kind as DocumentKind] ?? 'Documento'} ·{' '}
                    {when(doc.createdAt)} · {doc.professionalName}
                    {doc.canceledAt && doc.cancelReason ? ` · anulado: ${doc.cancelReason}` : ''}
                  </p>
                </div>
                <Button variant="outline" size="xs" asChild>
                  <a href={`/imprimir/documento/${doc.id}`} target="_blank" rel="noreferrer">
                    <PrinterIcon /> Imprimir
                  </a>
                </Button>
                {!doc.canceledAt && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setCanceling({ id: doc.id, title: doc.title })}
                  >
                    <BanIcon /> Anular
                  </Button>
                )}
              </Surface>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={canceling !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setCanceling(null);
            setReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular &quot;{canceling?.title}&quot;?</DialogTitle>
            <DialogDescription>
              O documento continua no prontuário, marcado como anulado, e sai assim se for impresso
              de novo.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 3) cancel.mutate();
            }}
          >
            <Input
              autoFocus
              placeholder="Motivo (ex.: dose errada)"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Motivo da anulação"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCanceling(null)}>
                Voltar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={reason.trim().length < 3 || cancel.isPending}
              >
                {cancel.isPending ? 'Anulando...' : 'Anular'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
