'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlusIcon,
  ChevronRightIcon,
  EyeOffIcon,
  ImagePlusIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { compressPhoto } from '@/lib/photo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createRecordBlockAction,
  createRecordEntryAction,
  deleteRecordBlockAction,
  deleteRecordEntryAction,
  deleteRecordPhotoAction,
  listClientRecordsAction,
  renameRecordBlockAction,
  setRecordPhotoStaffOnlyAction,
  updateRecordEntryAction,
} from '@/server/actions/client-record-actions';
import { listServicesAction } from '@/server/actions/service-actions';
import type { RecordBlockView, RecordEntryView } from '@/server/data/client-records';

/*
  Aba "Registros" do cliente: blocos por tratamento ("Limpeza de pele", "Depilação"), cada um com
  os dias de atendimento — anotação (o cliente vê), anotação interna e fotos do dia — para
  acompanhar a evolução. O cliente acompanha pela área dele.
*/

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function ClientRecordsTab({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const queryClient = useQueryClient();
  const key = ['client-records', clientId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listClientRecordsAction(clientId).then(unwrapResult),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const [creating, setCreating] = React.useState(false);
  const [entryFor, setEntryFor] = React.useState<{
    block: RecordBlockView;
    entry: RecordEntryView | null;
  } | null>(null);
  const [viewer, setViewer] = React.useState<string | null>(null);

  const first = clientName.split(' ')[0];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Registros de evolução</h2>
          <p className="text-label-secondary max-w-2xl text-[14px]">
            Um registro para cada tratamento (ex.: limpeza de pele, depilação), com as anotações e
            as fotos de cada dia. {first} acompanha a evolução pela área do cliente — menos o que
            estiver marcado como interno.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" /> Novo registro
        </Button>
      </div>

      {data && !data.photosEnabled && (
        <p className="bg-system-orange/10 text-system-orange rounded-2xl px-4 py-3 text-[13px]">
          O envio de fotos ainda não está ativado. As anotações já funcionam; as fotos passam a
          aparecer assim que o armazenamento for configurado.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-[22px]" />
      ) : !data?.blocks.length ? (
        <div className="bg-tile rounded-[22px]">
          <EmptyState
            icon={SparklesIcon}
            title="Nenhum registro ainda"
            description={`Crie um registro para cada tratamento de ${first} e adicione as fotos e anotações de cada sessão.`}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data.blocks.map((block, index) => (
            <BlockCard
              key={block.id}
              block={block}
              defaultOpen={index === 0}
              onAddDay={() => setEntryFor({ block, entry: null })}
              onEditDay={(entry) => setEntryFor({ block, entry })}
              onOpenPhoto={setViewer}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <NewBlockDialog
        open={creating}
        clientId={clientId}
        onClose={() => setCreating(false)}
        onCreated={async (block) => {
          setCreating(false);
          await refresh();
          // Já abre o primeiro dia do registro novo.
          setEntryFor({
            block: { id: block.id, title: block.title, createdAt: '', entries: [] },
            entry: null,
          });
        }}
      />
      {entryFor && (
        <EntryDialog
          block={entryFor.block}
          entry={entryFor.entry}
          photosEnabled={data?.photosEnabled ?? false}
          onClose={() => setEntryFor(null)}
          onSaved={async () => {
            setEntryFor(null);
            await refresh();
          }}
        />
      )}
      <Dialog open={viewer !== null} onOpenChange={(open: boolean) => !open && setViewer(null)}>
        <DialogContent className="p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">Foto</DialogTitle>
          {viewer && (
            // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento
            <img
              src={viewer}
              alt="Foto do registro"
              className="max-h-[80vh] w-full rounded-2xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Dias mostrados com o bloco aberto, antes de "Ver todos os dias". */
const RECENT_DAYS = 3;

function BlockCard({
  block,
  defaultOpen,
  onAddDay,
  onEditDay,
  onOpenPhoto,
  onChanged,
}: {
  block: RecordBlockView;
  /** Só o bloco mais recente começa aberto: com muitas fotos, a página não fica enorme. */
  defaultOpen: boolean;
  onAddDay: () => void;
  onEditDay: (entry: RecordEntryView) => void;
  onOpenPhoto: (url: string) => void;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [title, setTitle] = React.useState(block.title);
  const rename = useMutation({
    mutationFn: () => renameRecordBlockAction({ blockId: block.id, title }).then(unwrapResult),
    onSuccess: () => {
      setRenaming(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteRecordBlockAction(block.id).then(unwrapResult),
    onSuccess: () => {
      toast.success('Registro apagado.');
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const photos = block.entries.reduce((n, e) => n + e.photos.length, 0);
  const [open, setOpen] = React.useState(defaultOpen);
  const [showAll, setShowAll] = React.useState(false);
  const lastDay = block.entries[0]?.date;
  const recentThumbs = block.entries
    .flatMap((e) => e.photos)
    .filter((p) => p.url)
    .slice(0, 3);
  const visibleEntries = showAll ? block.entries : block.entries.slice(0, RECENT_DAYS);

  return (
    <article className="bg-tile flex flex-col gap-4 rounded-[22px] p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) rename.mutate();
            }}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={rename.isPending}>
              Salvar
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRightIcon
              className={cn(
                'text-label-secondary size-5 shrink-0 transition-transform',
                open && 'rotate-90',
              )}
            />
            <span className="min-w-0">
              <span className="block truncate text-[18px] font-semibold">{block.title}</span>
              <span className="text-label-secondary block text-[13px]">
                {block.entries.length} {block.entries.length === 1 ? 'dia' : 'dias'} · {photos}{' '}
                {photos === 1 ? 'foto' : 'fotos'}
                {lastDay && ` · último em ${formatDay(lastDay)}`}
              </span>
            </span>
            {!open && recentThumbs.length > 0 && (
              <span className="ml-auto hidden shrink-0 -space-x-2 sm:flex">
                {recentThumbs.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- link temporário
                  <img
                    key={p.id}
                    src={p.url!}
                    alt=""
                    className="ring-tile size-9 rounded-lg object-cover ring-2"
                  />
                ))}
              </span>
            )}
          </button>
        )}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => {
              setOpen(true);
              onAddDay();
            }}
          >
            <CalendarPlusIcon className="size-4" /> Adicionar dia
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Renomear registro"
            onClick={() => setRenaming((v) => !v)}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Apagar registro"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Apagar o registro "${block.title}" com todos os dias e fotos?`)) {
                remove.mutate();
              }
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </header>

      {!open ? null : block.entries.length === 0 ? (
        <p className="text-label-secondary text-[13px]">
          Nenhum dia ainda. Toque em “Adicionar dia” para registrar a primeira sessão.
        </p>
      ) : (
        <>
          <ol className="border-foreground/[0.08] flex flex-col gap-4 border-l-2 pl-4">
            {visibleEntries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                onEdit={() => onEditDay(entry)}
                onOpenPhoto={onOpenPhoto}
                onChanged={onChanged}
              />
            ))}
          </ol>
          {block.entries.length > RECENT_DAYS && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? 'Mostrar só os mais recentes'
                : `Ver todos os ${block.entries.length} dias`}
            </Button>
          )}
        </>
      )}
    </article>
  );
}

function EntryItem({
  entry,
  onEdit,
  onOpenPhoto,
  onChanged,
}: {
  entry: RecordEntryView;
  onEdit: () => void;
  onOpenPhoto: (url: string) => void;
  onChanged: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => deleteRecordEntryAction(entry.id).then(unwrapResult),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { photoId: string; staffOnly: boolean }) =>
      setRecordPhotoStaffOnlyAction(input).then(unwrapResult),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const removePhoto = useMutation({
    mutationFn: (photoId: string) => deleteRecordPhotoAction(photoId).then(unwrapResult),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="relative flex flex-col gap-2">
      <span
        className="bg-system-blue absolute top-1.5 -left-[23px] size-2.5 rounded-full"
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold tabular-nums">{formatDay(entry.date)}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Editar
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Apagar dia"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Apagar este dia com as fotos?')) remove.mutate();
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
      {entry.notes && <p className="text-[14px] whitespace-pre-wrap">{entry.notes}</p>}
      {entry.internalNotes && (
        <p className="bg-foreground/[0.04] text-label-secondary flex gap-1.5 rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          {entry.internalNotes}
        </p>
      )}
      {entry.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {entry.photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-xl bg-black/5"
            >
              {photo.url ? (
                <button
                  type="button"
                  className="size-full"
                  onClick={() => onOpenPhoto(photo.url!)}
                  aria-label="Abrir foto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- link temporário */}
                  <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ) : (
                <span className="text-label-secondary flex size-full items-center justify-center text-[11px]">
                  Indisponível
                </span>
              )}
              {photo.staffOnly && (
                <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  <EyeOffIcon className="size-3" /> Interna
                </span>
              )}
              <div className="absolute right-1 bottom-1 flex gap-1">
                <button
                  type="button"
                  className="rounded-full bg-black/60 p-1 text-white"
                  aria-label={photo.staffOnly ? 'Mostrar ao cliente' : 'Só para a equipe'}
                  title={photo.staffOnly ? 'Mostrar ao cliente' : 'Só para a equipe'}
                  onClick={() => toggle.mutate({ photoId: photo.id, staffOnly: !photo.staffOnly })}
                >
                  <EyeOffIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-full bg-black/60 p-1 text-white"
                  aria-label="Apagar foto"
                  onClick={() => {
                    if (window.confirm('Apagar esta foto?')) removePhoto.mutate(photo.id);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function NewBlockDialog({
  open,
  clientId,
  onClose,
  onCreated,
}: {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onCreated: (block: { id: string; title: string }) => void;
}) {
  const [title, setTitle] = React.useState('');
  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => listServicesAction(),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () => createRecordBlockAction({ clientId, title }).then(unwrapResult),
    onSuccess: (block) => {
      const name = title.trim();
      setTitle('');
      onCreated({ id: block.id, title: name });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const suggestions = (services ?? []).filter((s) => s.active).slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo registro</DialogTitle>
          <DialogDescription>
            Dê o nome do tratamento. Depois você adiciona os dias, com anotações e fotos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <Input
            autoFocus
            placeholder="Ex.: Limpeza de pele"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTitle(s.name)}
                  className="bg-foreground/[0.06] hover:bg-foreground/10 rounded-full px-3 py-1 text-[13px]"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending ? 'Criando...' : 'Criar registro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PendingPhoto = { id: string; file: File; preview: string; staffOnly: boolean };

function EntryDialog({
  block,
  entry,
  photosEnabled,
  onClose,
  onSaved,
}: {
  block: RecordBlockView;
  entry: RecordEntryView | null;
  photosEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = React.useState(entry?.date ?? todayIso());
  const [notes, setNotes] = React.useState(entry?.notes ?? '');
  const [internalNotes, setInternalNotes] = React.useState(entry?.internalNotes ?? '');
  const [photos, setPhotos] = React.useState<PendingPhoto[]>([]);
  const [saving, setSaving] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(
    () => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao fechar
    [],
  );

  function addFiles(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    setPhotos((current) =>
      [
        ...current,
        ...list.map((file) => ({
          id: `${file.name}-${file.size}-${Math.random()}`,
          file,
          preview: URL.createObjectURL(file),
          staffOnly: false,
        })),
      ].slice(0, 12),
    );
    if (fileInput.current) fileInput.current.value = '';
  }

  async function save() {
    try {
      setSaving('Salvando o dia…');
      const body = { date, notes, internalNotes };
      let entryId = entry?.id ?? null;
      if (entryId) {
        unwrapResult(await updateRecordEntryAction({ entryId, ...body }));
      } else {
        entryId = unwrapResult(await createRecordEntryAction({ blockId: block.id, ...body })).id;
      }
      for (const [i, photo] of photos.entries()) {
        setSaving(`Enviando foto ${i + 1} de ${photos.length}…`);
        const blob = await compressPhoto(photo.file);
        const form = new FormData();
        form.append('entryId', entryId);
        form.append('staffOnly', String(photo.staffOnly));
        form.append('file', new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
        const res = await fetch('/api/clientes/registros/fotos', { method: 'POST', body: form });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Não foi possível enviar uma das fotos.');
        }
      }
      toast.success(entry ? 'Dia atualizado.' : 'Dia registrado.');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
      setSaving(null);
    }
  }

  return (
    <Dialog open onOpenChange={(next: boolean) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? 'Editar dia' : 'Adicionar dia'}</DialogTitle>
          <DialogDescription>{block.title}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-date">Data</Label>
            <Input
              id="record-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="sm:w-56"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-notes">Anotações (o cliente vê)</Label>
            <Textarea
              id="record-notes"
              rows={3}
              maxLength={5000}
              placeholder="Ex.: pele hidratada, menos manchas na região da testa."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-internal" className="flex items-center gap-1.5">
              <LockIcon className="size-3.5" /> Anotação interna (só a equipe)
            </Label>
            <Textarea
              id="record-internal"
              rows={2}
              maxLength={5000}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </div>

          {photosEnabled ? (
            <div className="flex flex-col gap-2">
              <Label>Fotos do dia</Label>
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="flex flex-col gap-1">
                      <div className="relative aspect-square overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element -- prévia local */}
                        <img src={photo.preview} alt="" className="size-full object-cover" />
                        <button
                          type="button"
                          aria-label="Tirar foto"
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                          onClick={() => setPhotos((list) => list.filter((p) => p.id !== photo.id))}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      <label className="text-label-secondary flex items-center gap-1.5 text-[11px]">
                        <Switch
                          checked={photo.staffOnly}
                          onCheckedChange={(v: boolean) =>
                            setPhotos((list) =>
                              list.map((p) => (p.id === photo.id ? { ...p, staffOnly: v } : p)),
                            )
                          }
                          aria-label="Só para a equipe"
                        />
                        Só equipe
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className={cn('self-start', photos.length >= 12 && 'hidden')}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlusIcon className="size-4" /> Adicionar fotos
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <p className="text-label-secondary text-[12px]">
                Tire na hora pela câmera ou escolha da galeria. As fotos ficam privadas: só a sua
                equipe e o cliente (as que não forem “só equipe”) conseguem ver.
              </p>
            </div>
          ) : (
            <p className="text-label-secondary text-[12px]">
              O envio de fotos ainda não está ativado.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={!!saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!!saving || !date} onClick={() => void save()}>
            {saving ?? (entry ? 'Salvar' : 'Registrar dia')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
