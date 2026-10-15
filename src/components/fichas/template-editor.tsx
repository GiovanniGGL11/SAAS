'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import {
  type ChoiceOption,
  type FormSchema,
  type Question,
  type QuestionType,
  type Section,
  FORM_TYPE_LABEL,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  formSchemaValidator,
  newId,
  optionsOf,
} from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormRenderer } from '@/components/fichas/form-renderer';
import { FILLER_LABEL, RENEWAL_LABEL, REQUIREMENT_LABEL } from '@/components/fichas/labels';
import { saveTemplateAction } from '@/server/actions/form-actions';

export type TemplateDraft = {
  id: string | null;
  name: string;
  type: keyof typeof FORM_TYPE_LABEL;
  description: string;
  instructions: string;
  fillableBy: keyof typeof FILLER_LABEL;
  renewal: keyof typeof RENEWAL_LABEL;
  renewalDays: number | null;
  requirement: keyof typeof REQUIREMENT_LABEL;
  serviceIds: string[];
  schema: FormSchema;
  currentVersion: number;
  archived: boolean;
};

const isChoice = (t: QuestionType) =>
  t === 'yes_no' || t === 'single_choice' || t === 'multi_choice';

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function blankQuestion(): Question {
  return { id: newId('q'), type: 'short_text', title: '', required: false };
}

/**
 * Editor de modelo: configurações, seções e perguntas. Reordenar por botões (celular e teclado)
 * ou arrastando (computador). Salvar mudança de perguntas cria uma versão nova do modelo.
 */
export function TemplateEditor({
  initial,
  services,
}: {
  initial: TemplateDraft;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(initial);
  const [dirty, setDirty] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState(initial.schema.sections[0]?.id ?? '');
  const [dragging, setDragging] = React.useState<{ section: number; question: number } | null>(
    null,
  );

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(patch: Partial<TemplateDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }
  function setSections(fn: (sections: Section[]) => Section[]) {
    setDraft((d) => ({ ...d, schema: { sections: fn(d.schema.sections) } }));
    setDirty(true);
  }
  function setQuestion(si: number, qi: number, patch: Partial<Question>) {
    setSections((sections) =>
      sections.map((s, i) =>
        i === si
          ? { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) }
          : s,
      ),
    );
  }
  function setQuestions(si: number, fn: (questions: Question[]) => Question[]) {
    setSections((sections) =>
      sections.map((s, i) => (i === si ? { ...s, questions: fn(s.questions) } : s)),
    );
  }

  const save = useMutation({
    mutationFn: () =>
      saveTemplateAction({
        id: draft.id,
        name: draft.name,
        type: draft.type,
        description: draft.description || null,
        instructions: draft.instructions || null,
        fillableBy: draft.fillableBy,
        renewal: draft.renewal,
        renewalDays: draft.renewal === 'AFTER_DAYS' ? draft.renewalDays : null,
        requirement: draft.requirement,
        schema: draft.schema,
        serviceIds: draft.serviceIds,
      }).then(unwrapResult),
    onSuccess: (result) => {
      setDirty(false);
      setDraft((d) => ({ ...d, id: result.id, currentVersion: result.version }));
      toast.success(
        result.newVersion && result.version > 1
          ? `Salvo como versão ${result.version}. Fichas já pedidas continuam na versão delas.`
          : 'Modelo salvo.',
      );
      if (!initial.id) router.replace(`/fichas/modelos/${result.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function trySave() {
    if (!draft.name.trim()) {
      toast.error('Informe o nome do modelo.');
      document.getElementById('tpl-name')?.focus();
      return;
    }
    const check = formSchemaValidator.safeParse(draft.schema);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? 'Confira as perguntas.');
      return;
    }
    save.mutate();
  }

  // Perguntas de escolha anteriores a cada pergunta: as que podem servir de condição.
  const previousChoices = (si: number, qi: number) =>
    draft.schema.sections
      .flatMap((s, i) => s.questions.map((q, j) => ({ q, i, j })))
      .filter(
        ({ q, i, j }) => (i < si || (i === si && j < qi)) && isChoice(q.type) && q.title.trim(),
      );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Voltar para fichas">
            <Link href="/fichas">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-bold tracking-[-0.02em] md:text-[28px]">
              {draft.id ? draft.name || 'Modelo sem nome' : 'Novo modelo'}
            </h1>
            {draft.id && (
              <p className="text-label-secondary text-[13px]">
                Versão {draft.currentVersion}. Mudar perguntas cria uma versão nova; fichas já
                pedidas não mudam.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}>
            <EyeIcon /> Prévia
          </Button>
          <Button onClick={trySave} disabled={save.isPending || draft.archived}>
            {save.isPending ? 'Salvando…' : 'Salvar modelo'}
          </Button>
        </div>
      </div>

      {draft.archived && (
        <p className="rounded-xl bg-amber-500/[0.08] p-3 text-[13px] ring-1 ring-amber-500/25">
          Modelo arquivado: não recebe pedidos novos. Restaure na lista de modelos para editar.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Lista de seções (computador): navegar e reordenar. */}
        <nav aria-label="Seções do modelo" className="hidden lg:block">
          <div className="bg-tile sticky top-4 flex flex-col gap-1 rounded-[18px] p-2">
            {draft.schema.sections.map((s, si) => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[13px]',
                    activeSection === s.id
                      ? 'bg-system-blue/10 text-system-blue font-medium'
                      : 'hover:bg-foreground/[0.04]',
                  )}
                  onClick={() => {
                    setActiveSection(s.id);
                    document
                      .getElementById(`sec-${s.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {s.title || `Seção ${si + 1}`}
                </button>
                <IconButton
                  label="Subir seção"
                  onClick={() => setSections((l) => move(l, si, si - 1))}
                  disabled={si === 0}
                >
                  <ArrowUpIcon />
                </IconButton>
                <IconButton
                  label="Descer seção"
                  onClick={() => setSections((l) => move(l, si, si + 1))}
                  disabled={si === draft.schema.sections.length - 1}
                >
                  <ArrowDownIcon />
                </IconButton>
              </div>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <Settings draft={draft} update={update} services={services} />

          {draft.schema.sections.map((section, si) => (
            <section
              key={section.id}
              id={`sec-${section.id}`}
              className="bg-tile flex scroll-mt-4 flex-col gap-4 rounded-[22px] p-4 md:p-6"
              aria-label={`Seção ${si + 1}`}
              onFocus={() => setActiveSection(section.id)}
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input
                    aria-label={`Título da seção ${si + 1}`}
                    placeholder="Título da seção"
                    className="text-[16px] font-semibold"
                    value={section.title}
                    onChange={(e) =>
                      setSections((l) =>
                        l.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Descrição da seção ${si + 1}`}
                    placeholder="Descrição (opcional)"
                    value={section.description ?? ''}
                    onChange={(e) =>
                      setSections((l) =>
                        l.map((s, i) =>
                          i === si ? { ...s, description: e.target.value || undefined } : s,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Subir seção"
                    onClick={() => setSections((l) => move(l, si, si - 1))}
                    disabled={si === 0}
                  >
                    <ArrowUpIcon />
                  </IconButton>
                  <IconButton
                    label="Descer seção"
                    onClick={() => setSections((l) => move(l, si, si + 1))}
                    disabled={si === draft.schema.sections.length - 1}
                  >
                    <ArrowDownIcon />
                  </IconButton>
                  <IconButton
                    label="Duplicar seção"
                    onClick={() =>
                      setSections((l) => {
                        const copy: Section = {
                          ...section,
                          id: newId('s'),
                          title: `${section.title} (cópia)`,
                          questions: section.questions.map((q) => ({
                            ...q,
                            id: newId('q'),
                            showIf: null,
                            options: q.options?.map((o) => ({ ...o, id: newId('o') })),
                          })),
                        };
                        const next = [...l];
                        next.splice(si + 1, 0, copy);
                        return next;
                      })
                    }
                  >
                    <CopyIcon />
                  </IconButton>
                  <IconButton
                    label="Remover seção"
                    onClick={() => setSections((l) => l.filter((_, i) => i !== si))}
                    disabled={draft.schema.sections.length === 1}
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-label-secondary">Quem responde:</span>
                <SegmentedControl
                  size="sm"
                  value={section.audience}
                  onValueChange={(audience) =>
                    setSections((l) => l.map((s, i) => (i === si ? { ...s, audience } : s)))
                  }
                  options={[
                    { value: 'any', label: 'Todos' },
                    { value: 'client', label: 'Cliente' },
                    { value: 'staff', label: 'Só a equipe' },
                  ]}
                />
              </div>

              <ol className="flex flex-col gap-3">
                {section.questions.map((question, qi) => (
                  <li
                    key={question.id}
                    onDragOver={(e) => {
                      if (dragging?.section === si) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging?.section === si)
                        setQuestions(si, (l) => move(l, dragging.question, qi));
                      setDragging(null);
                    }}
                    className={cn(
                      'ring-foreground/10 bg-background flex flex-col gap-3 rounded-[16px] p-3 ring-1 md:p-4',
                      dragging?.section === si && dragging.question === qi && 'opacity-50',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        draggable
                        onDragStart={() => setDragging({ section: si, question: qi })}
                        onDragEnd={() => setDragging(null)}
                        className="text-label-secondary hidden cursor-grab md:inline-flex"
                        title="Arraste para reordenar"
                        aria-hidden
                      >
                        <GripVerticalIcon className="size-4" />
                      </span>
                      <span className="text-label-secondary text-[12px] tabular-nums">
                        {qi + 1}.
                      </span>
                      <Select
                        value={question.type}
                        onValueChange={(value: string) => {
                          const type = value as QuestionType;
                          setQuestion(si, qi, {
                            type,
                            options:
                              type === 'single_choice' || type === 'multi_choice'
                                ? question.options?.length
                                  ? question.options
                                  : [
                                      { id: newId('o'), label: 'Opção 1' },
                                      { id: newId('o'), label: 'Opção 2' },
                                    ]
                                : undefined,
                          });
                        }}
                      >
                        <SelectTrigger className="w-44" aria-label={`Tipo da pergunta ${qi + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {QUESTION_TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="ml-auto flex items-center gap-2 text-[13px]">
                        Obrigatória
                        <Switch
                          checked={question.required}
                          onCheckedChange={(required: boolean) => setQuestion(si, qi, { required })}
                        />
                      </label>
                    </div>
                    <Input
                      aria-label={`Pergunta ${qi + 1}`}
                      placeholder="Escreva a pergunta"
                      value={question.title}
                      onChange={(e) => setQuestion(si, qi, { title: e.target.value })}
                    />
                    <Input
                      aria-label={`Texto de ajuda da pergunta ${qi + 1}`}
                      placeholder="Texto de ajuda (opcional)"
                      value={question.help ?? ''}
                      onChange={(e) => setQuestion(si, qi, { help: e.target.value || undefined })}
                    />
                    {(question.type === 'single_choice' || question.type === 'multi_choice') && (
                      <OptionsEditor
                        options={question.options ?? []}
                        onChange={(options) => setQuestion(si, qi, { options })}
                      />
                    )}
                    <ConditionEditor
                      question={question}
                      candidates={previousChoices(si, qi).map(({ q }) => q)}
                      onChange={(showIf) => setQuestion(si, qi, { showIf })}
                    />
                    <div className="flex flex-wrap gap-1">
                      <IconButton
                        label="Subir pergunta"
                        onClick={() => setQuestions(si, (l) => move(l, qi, qi - 1))}
                        disabled={qi === 0}
                      >
                        <ArrowUpIcon />
                      </IconButton>
                      <IconButton
                        label="Descer pergunta"
                        onClick={() => setQuestions(si, (l) => move(l, qi, qi + 1))}
                        disabled={qi === section.questions.length - 1}
                      >
                        <ArrowDownIcon />
                      </IconButton>
                      <IconButton
                        label="Duplicar pergunta"
                        onClick={() =>
                          setQuestions(si, (l) => {
                            const next = [...l];
                            next.splice(qi + 1, 0, {
                              ...question,
                              id: newId('q'),
                              options: question.options?.map((o) => ({ ...o, id: newId('o') })),
                            });
                            return next;
                          })
                        }
                      >
                        <CopyIcon />
                      </IconButton>
                      <IconButton
                        label="Remover pergunta"
                        onClick={() =>
                          // Condições que apontavam para ela deixam de existir junto.
                          setSections((l) =>
                            l.map((s, i) => ({
                              ...s,
                              questions: s.questions
                                .filter((q, j) => !(i === si && j === qi))
                                .map((q) =>
                                  q.showIf?.questionId === question.id ? { ...q, showIf: null } : q,
                                ),
                            })),
                          )
                        }
                      >
                        <Trash2Icon />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setQuestions(si, (l) => [...l, blankQuestion()])}
              >
                <PlusIcon /> Adicionar pergunta
              </Button>
            </section>
          ))}

          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              const id = newId('s');
              setSections((l) => [
                ...l,
                { id, title: '', audience: 'any', questions: [blankQuestion()] },
              ]);
              setActiveSection(id);
            }}
          >
            <PlusIcon /> Adicionar seção
          </Button>
        </div>
      </div>

      <PreviewDialog open={preview} onOpenChange={setPreview} draft={draft} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function Settings({
  draft,
  update,
  services,
}: {
  draft: TemplateDraft;
  update: (patch: Partial<TemplateDraft>) => void;
  services: { id: string; name: string }[];
}) {
  return (
    <section
      className="bg-tile flex flex-col gap-4 rounded-[22px] p-4 md:p-6"
      aria-label="Configurações do modelo"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome" htmlFor="tpl-name">
          <Input
            id="tpl-name"
            value={draft.name}
            maxLength={120}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label="Tipo">
          <Select
            value={draft.type}
            onValueChange={(v: string) => update({ type: v as TemplateDraft['type'] })}
          >
            <SelectTrigger className="w-full" aria-label="Tipo de ficha">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FORM_TYPE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Descrição (para a equipe)" htmlFor="tpl-desc">
        <Input
          id="tpl-desc"
          value={draft.description}
          maxLength={1000}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      <Field label="Instruções para quem responde" htmlFor="tpl-instr">
        <Textarea
          id="tpl-instr"
          rows={2}
          value={draft.instructions}
          maxLength={2000}
          onChange={(e) => update({ instructions: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Quem preenche">
          <Select
            value={draft.fillableBy}
            onValueChange={(v: string) => update({ fillableBy: v as TemplateDraft['fillableBy'] })}
          >
            <SelectTrigger className="w-full" aria-label="Quem preenche">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILLER_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pedir de novo">
          <Select
            value={draft.renewal}
            onValueChange={(v: string) => update({ renewal: v as TemplateDraft['renewal'] })}
          >
            <SelectTrigger className="w-full" aria-label="Política de atualização">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RENEWAL_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Para iniciar o atendimento">
          <Select
            value={draft.requirement}
            onValueChange={(v: string) =>
              update({ requirement: v as TemplateDraft['requirement'] })
            }
          >
            <SelectTrigger className="w-full" aria-label="Exigência para iniciar o atendimento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REQUIREMENT_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {draft.renewal === 'AFTER_DAYS' && (
        <Field label="Depois de quantos dias" htmlFor="tpl-days">
          <Input
            id="tpl-days"
            inputMode="numeric"
            className="w-32"
            value={draft.renewalDays ?? ''}
            onChange={(e) =>
              update({ renewalDays: Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || null })
            }
          />
        </Field>
      )}
      <Field label="Serviços que pedem esta ficha">
        {services.length === 0 ? (
          <p className="text-label-secondary text-[13px]">Nenhum serviço cadastrado.</p>
        ) : (
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {services.map((s) => {
              const on = draft.serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    update({
                      serviceIds: on
                        ? draft.serviceIds.filter((id) => id !== s.id)
                        : [...draft.serviceIds, s.id],
                    })
                  }
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                    on
                      ? 'bg-system-blue text-white'
                      : 'bg-foreground/[0.06] hover:bg-foreground/10',
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-label-secondary text-[12px]">
          Sem serviço marcado, a ficha só é pedida manualmente (no cliente ou no pacote).
        </p>
      </Field>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-medium">{label}</span>
      )}
      {children}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: ChoiceOption[];
  onChange: (options: ChoiceOption[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium">Opções</span>
      {options.map((option, oi) => (
        <div key={option.id} className="flex items-center gap-1">
          <Input
            aria-label={`Opção ${oi + 1}`}
            value={option.label}
            onChange={(e) =>
              onChange(options.map((o, i) => (i === oi ? { ...o, label: e.target.value } : o)))
            }
          />
          <IconButton
            label="Subir opção"
            onClick={() => onChange(move(options, oi, oi - 1))}
            disabled={oi === 0}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            label="Descer opção"
            onClick={() => onChange(move(options, oi, oi + 1))}
            disabled={oi === options.length - 1}
          >
            <ArrowDownIcon />
          </IconButton>
          <IconButton
            label="Remover opção"
            onClick={() => onChange(options.filter((_, i) => i !== oi))}
            disabled={options.length <= 2}
          >
            <Trash2Icon />
          </IconButton>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange([...options, { id: newId('o'), label: `Opção ${options.length + 1}` }])
        }
      >
        <PlusIcon /> Adicionar opção
      </Button>
    </div>
  );
}

/** "Mostrar quando": uma pergunta de escolha anterior e a opção que faz esta aparecer. */
function ConditionEditor({
  question,
  candidates,
  onChange,
}: {
  question: Question;
  candidates: Question[];
  onChange: (showIf: Question['showIf']) => void;
}) {
  const target = candidates.find((q) => q.id === question.showIf?.questionId);
  if (candidates.length === 0 && !question.showIf) return null;
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <span className="text-[12px] font-medium">Mostrar esta pergunta</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={question.showIf?.questionId ?? 'always'}
          onValueChange={(value: string) => {
            if (value === 'always') return onChange(null);
            const q = candidates.find((c) => c.id === value)!;
            onChange({ questionId: q.id, optionId: optionsOf(q)[0]?.id ?? '' });
          }}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label="Condição">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Sempre</SelectItem>
            {candidates.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                Quando “{q.title.slice(0, 40)}” for…
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {target && question.showIf && (
          <Select
            value={question.showIf.optionId}
            onValueChange={(optionId: string) => onChange({ questionId: target.id, optionId })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Opção da condição">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsOf(target).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {question.showIf && !target && (
        <p className="text-system-red text-[12px]">
          A pergunta da condição foi movida para depois desta ou removida.
        </p>
      )}
    </div>
  );
}

/** Prévia interativa: como a equipe e o cliente veem, em largura de celular ou computador. */
function PreviewDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TemplateDraft;
}) {
  const [device, setDevice] = React.useState<'mobile' | 'desktop'>('mobile');
  const [audience, setAudience] = React.useState<'client' | 'staff'>('client');
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const schema = {
    sections: draft.schema.sections.filter((s) => audience === 'staff' || s.audience !== 'staff'),
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prévia: {draft.name || 'Modelo sem nome'}</DialogTitle>
          <DialogDescription>Respostas da prévia não são salvas.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            size="sm"
            value={device}
            onValueChange={setDevice}
            options={[
              { value: 'mobile', label: 'Celular' },
              { value: 'desktop', label: 'Computador' },
            ]}
          />
          <SegmentedControl
            size="sm"
            value={audience}
            onValueChange={setAudience}
            options={[
              { value: 'client', label: 'Visão do cliente' },
              { value: 'staff', label: 'Visão da equipe' },
            ]}
          />
        </div>
        <div
          className={cn(
            'ring-foreground/10 bg-background mx-auto w-full rounded-[22px] p-4 ring-1',
            device === 'mobile' ? 'max-w-[390px]' : 'max-w-none',
          )}
        >
          {draft.instructions && (
            <p className="text-label-secondary mb-4 text-[13px] whitespace-pre-wrap">
              {draft.instructions}
            </p>
          )}
          <FormRenderer
            schema={schema}
            answers={answers}
            onChange={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))}
            idPrefix="pv"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
