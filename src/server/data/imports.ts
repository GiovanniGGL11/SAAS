import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { parseCsv } from '@/lib/csv';
import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  checkClientRow,
  checkProductRow,
  sameName,
  suggestMapping,
  type ClientRowValue,
  type DuplicateMode,
  type ImportKind,
  type Mapping,
  type ProductRowValue,
} from '@/lib/import';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Importação assistida de clientes e produtos:
  arquivo → colunas reconhecidas → mapeamento sugerido → validação → duplicados → prévia →
  confirmação → importação → relatório por linha.
  - O arquivo não é guardado: chega como texto, é lido e descartado. Fica só o hash (para uma
    nova tentativa com o mesmo arquivo e as mesmas escolhas não importar de novo) e o relatório
    com número da linha e resultado — sem os dados das linhas.
  - Duplicado é só por chave exata (telefone, e-mail, CPF; código ou nome idêntico do produto).
    Nome parecido nunca junta registros; no máximo vira aviso.
  - Nada é sobrescrito: com "completar vazios", só campos vazios do cadastro existente recebem
    o valor do arquivo. Estoque de produto existente nunca muda pela importação.
*/

export type ParsedFile = { header: string[]; rows: string[][]; fileHash: string };

export function parseImportFile(textContent: string): ParsedFile {
  if (typeof textContent !== 'string' || !textContent.trim()) {
    throw new UserError('O arquivo está vazio.');
  }
  if (Buffer.byteLength(textContent, 'utf8') > IMPORT_LIMITS.maxBytes) {
    throw new UserError('Arquivo grande demais. Divida em partes de até 5.000 linhas.');
  }
  const all = parseCsv(textContent);
  if (all.length < 2)
    throw new UserError('O arquivo precisa ter o cabeçalho e ao menos uma linha.');
  const header = all[0].map((h) => h.trim().slice(0, 80));
  if (header.length > IMPORT_LIMITS.maxColumns) throw new UserError('Colunas demais no arquivo.');
  const rows = all.slice(1);
  if (rows.length > IMPORT_LIMITS.maxRows) {
    throw new UserError(
      `Importe no máximo ${IMPORT_LIMITS.maxRows.toLocaleString('pt-BR')} linhas por vez.`,
    );
  }
  const fileHash = createHash('sha256').update(textContent).digest('hex');
  return { header, rows, fileHash };
}

export function analyzeColumns(kind: ImportKind, textContent: string) {
  const { header, rows } = parseImportFile(textContent);
  return {
    header,
    totalRows: rows.length,
    mapping: suggestMapping(kind, header),
    fields: IMPORT_FIELDS[kind].map((f) => ({
      key: f.key,
      label: f.label,
      required: !!f.required,
    })),
    sample: rows.slice(0, 5).map((r) => r.map((c) => c.slice(0, 60))),
  };
}

function assertMapping(kind: ImportKind, mapping: Mapping, header: string[]) {
  for (const field of IMPORT_FIELDS[kind]) {
    const index = mapping[field.key];
    if (index != null && (index < 0 || index >= header.length)) {
      throw new UserError('Mapeamento de colunas inválido.');
    }
    if (field.required && index == null) {
      throw new UserError(`Escolha a coluna de "${field.label}".`);
    }
  }
}

export type RowOutcome = 'new' | 'duplicate' | 'duplicate_in_file' | 'invalid';

export type PlannedRow = {
  row: number;
  outcome: RowOutcome;
  messages: string[];
  existingId?: string;
  matchedBy?: string;
  /** Prévia (só para a tela; não é guardada). */
  label: string;
};

type ClientPlan = PlannedRow & { value?: ClientRowValue };
type ProductPlan = PlannedRow & { value?: ProductRowValue };

async function planClients(
  companyId: string,
  rows: string[][],
  mapping: Mapping,
): Promise<ClientPlan[]> {
  const checked = rows.map((r) => checkClientRow(r, mapping));
  const phones = checked.map((c) => c.value?.phone).filter((v): v is string => !!v);
  const emails = checked.map((c) => c.value?.email).filter((v): v is string => !!v);
  const cpfs = checked.map((c) => c.value?.cpf).filter((v): v is string => !!v);
  const names = checked.map((c) => c.value?.name).filter((v): v is string => !!v);
  const existing = await prisma.client.findMany({
    where: {
      companyId,
      OR: [
        ...(phones.length ? [{ phone: { in: phones } }] : []),
        ...(emails.length ? [{ email: { in: emails } }] : []),
        ...(cpfs.length ? [{ cpf: { in: cpfs } }] : []),
        ...(names.length ? [{ name: { in: names, mode: 'insensitive' as const } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, email: true, cpf: true },
  });
  const seen = new Map<string, number>();
  return checked.map((c, i) => {
    const row = i + 2; // linha 1 é o cabeçalho
    if (!c.value)
      return {
        row,
        outcome: 'invalid',
        messages: c.errors,
        label: rows[i][mapping.name ?? 0]?.slice(0, 60) ?? '',
      };
    const v = c.value;
    const keys = [
      v.phone && `p:${v.phone}`,
      v.email && `e:${v.email}`,
      v.cpf && `c:${v.cpf}`,
    ].filter(Boolean) as string[];
    const repeated = keys.find((k) => seen.has(k));
    if (repeated) {
      return {
        row,
        outcome: 'duplicate_in_file',
        messages: [`Repete a linha ${seen.get(repeated)} do arquivo.`],
        label: v.name,
      };
    }
    keys.forEach((k) => seen.set(k, row));
    const match =
      (v.phone &&
        existing.find((e) => e.phone === v.phone) && {
          by: 'telefone',
          e: existing.find((e) => e.phone === v.phone)!,
        }) ||
      (v.email &&
        existing.find((e) => e.email === v.email) && {
          by: 'e-mail',
          e: existing.find((e) => e.email === v.email)!,
        }) ||
      (v.cpf &&
        existing.find((e) => e.cpf === v.cpf) && {
          by: 'CPF',
          e: existing.find((e) => e.cpf === v.cpf)!,
        }) ||
      null;
    if (match) {
      return {
        row,
        outcome: 'duplicate',
        messages: [`Já cadastrado (${match.e.name}), mesmo ${match.by}.`],
        existingId: match.e.id,
        matchedBy: match.by,
        label: v.name,
        value: v,
      };
    }
    const sameNamed = existing.find((e) => sameName(e.name) === sameName(v.name));
    return {
      row,
      outcome: 'new',
      messages: sameNamed
        ? ['Há um cliente com o mesmo nome e outro contato: será criado separado (confira depois).']
        : [],
      label: v.name,
      value: v,
    };
  });
}

async function planProducts(
  companyId: string,
  rows: string[][],
  mapping: Mapping,
): Promise<ProductPlan[]> {
  const checked = rows.map((r) => checkProductRow(r, mapping));
  const existing = await prisma.product.findMany({
    where: { companyId },
    select: { id: true, name: true, sku: true },
  });
  const byName = new Map(existing.map((p) => [sameName(p.name), p]));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
  const seen = new Map<string, number>();
  return checked.map((c, i) => {
    const row = i + 2;
    if (!c.value)
      return {
        row,
        outcome: 'invalid',
        messages: c.errors,
        label: rows[i][mapping.name ?? 0]?.slice(0, 60) ?? '',
      };
    const v = c.value;
    const key = v.sku ? `s:${v.sku.toLowerCase()}` : `n:${sameName(v.name)}`;
    if (seen.has(key)) {
      return {
        row,
        outcome: 'duplicate_in_file',
        messages: [`Repete a linha ${seen.get(key)} do arquivo.`],
        label: v.name,
      };
    }
    seen.set(key, row);
    const match = (v.sku && bySku.get(v.sku.toLowerCase())) || byName.get(sameName(v.name));
    if (match) {
      return {
        row,
        outcome: 'duplicate',
        messages: [`Já cadastrado (${match.name}). O estoque dele não muda pela importação.`],
        existingId: match.id,
        matchedBy: v.sku && bySku.get(v.sku.toLowerCase()) ? 'código' : 'nome idêntico',
        label: v.name,
        value: v,
      };
    }
    const messages: string[] = [];
    if (v.salePrice == null) messages.push('Sem preço de venda: entra como R$ 0,00.');
    return { row, outcome: 'new', messages, label: v.name, value: v };
  });
}

async function plan(kind: ImportKind, companyId: string, rows: string[][], mapping: Mapping) {
  return kind === 'clients'
    ? planClients(companyId, rows, mapping)
    : planProducts(companyId, rows, mapping);
}

export async function previewImport(params: {
  companyId: string;
  kind: ImportKind;
  text: string;
  mapping: Mapping;
}) {
  const { header, rows } = parseImportFile(params.text);
  assertMapping(params.kind, params.mapping, header);
  const planned = await plan(params.kind, params.companyId, rows, params.mapping);
  const count = (o: RowOutcome) => planned.filter((p) => p.outcome === o).length;
  return {
    totalRows: rows.length,
    newRows: count('new'),
    duplicates: count('duplicate'),
    duplicatesInFile: count('duplicate_in_file'),
    invalid: count('invalid'),
    rows: planned
      .slice(0, IMPORT_LIMITS.previewRows)
      .map(({ row, outcome, messages, label, matchedBy }) => ({
        row,
        outcome,
        messages,
        label,
        matchedBy: matchedBy ?? null,
      })),
    problems: planned
      .filter((p) => p.outcome === 'invalid')
      .slice(0, 200)
      .map(({ row, messages }) => ({ row, messages })),
  };
}

type ReportRow = {
  row: number;
  outcome: 'created' | 'updated' | 'skipped' | 'failed';
  message: string;
};

const CLIENT_FILLABLE = [
  'email',
  'cpf',
  'birthDate',
  'notes',
  'zipCode',
  'street',
  'number',
  'district',
  'city',
  'state',
] as const;

/**
 * Importa de fato. Idempotente: o mesmo arquivo com as mesmas escolhas devolve o relatório da
 * importação anterior em vez de importar de novo. Falha numa linha não derruba as outras; o
 * relatório diz o que entrou, o que foi pulado e por quê.
 */
export async function runImport(params: {
  companyId: string;
  userId: string;
  kind: ImportKind;
  text: string;
  fileName?: string | null;
  mapping: Mapping;
  duplicateMode: DuplicateMode;
}) {
  const { header, rows, fileHash } = parseImportFile(params.text);
  assertMapping(params.kind, params.mapping, header);
  const optionsHash = createHash('sha256')
    .update(JSON.stringify({ mapping: params.mapping, mode: params.duplicateMode }))
    .digest('hex');
  const key = { companyId: params.companyId, kind: params.kind, fileHash, optionsHash };

  const previous = await prisma.importBatch.findUnique({
    where: { companyId_kind_fileHash_optionsHash: key },
  });
  if (previous && (previous.status === 'DONE' || previous.status === 'PARTIAL')) {
    return { batchId: previous.id, repeated: true, ...summary(previous) };
  }
  if (previous?.status === 'RUNNING' && Date.now() - previous.createdAt.getTime() < 10 * 60_000) {
    throw new UserError('Esta importação já está em andamento. Aguarde o relatório.');
  }
  let batch;
  try {
    batch = previous
      ? await prisma.importBatch.update({
          where: { id: previous.id },
          data: {
            status: 'RUNNING',
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            report: Prisma.JsonNull,
            finishedAt: null,
          },
        })
      : await prisma.importBatch.create({
          data: {
            ...key,
            fileName: params.fileName?.slice(0, 120) || null,
            status: 'RUNNING',
            totalRows: rows.length,
            createdByUserId: params.userId,
          },
        });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new UserError('Esta importação já está em andamento. Aguarde o relatório.');
    }
    throw error;
  }

  const planned = await plan(params.kind, params.companyId, rows, params.mapping);
  const report: ReportRow[] = [];
  for (const item of planned) {
    if (item.outcome === 'invalid') {
      report.push({ row: item.row, outcome: 'failed', message: item.messages.join(' ') });
      continue;
    }
    if (item.outcome === 'duplicate_in_file') {
      report.push({ row: item.row, outcome: 'skipped', message: item.messages.join(' ') });
      continue;
    }
    try {
      if (params.kind === 'clients') {
        report.push(
          await importClientRow(params.companyId, item as ClientPlan, params.duplicateMode),
        );
      } else {
        report.push(await importProductRow(params.companyId, params.userId, item as ProductPlan));
      }
    } catch (error) {
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      report.push({
        row: item.row,
        outcome: duplicate ? 'skipped' : 'failed',
        message: duplicate
          ? 'Já existe um cadastro com este telefone ou código.'
          : 'Não foi possível gravar esta linha.',
      });
    }
  }
  const tally = (o: ReportRow['outcome']) => report.filter((r) => r.outcome === o).length;
  const failed = tally('failed');
  const done = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: failed > 0 ? 'PARTIAL' : 'DONE',
      created: tally('created'),
      updated: tally('updated'),
      skipped: tally('skipped'),
      failed,
      report: report as unknown as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ImportBatch',
    entityId: done.id,
    action: 'imported',
    userId: params.userId,
    metadata: {
      kind: params.kind,
      created: done.created,
      updated: done.updated,
      skipped: done.skipped,
      failed,
    },
  });
  return { batchId: done.id, repeated: false, ...summary(done) };
}

function summary(batch: {
  status: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  report: Prisma.JsonValue;
}) {
  return {
    status: batch.status,
    totalRows: batch.totalRows,
    created: batch.created,
    updated: batch.updated,
    skipped: batch.skipped,
    failed: batch.failed,
    report: ((batch.report ?? []) as ReportRow[])
      .filter((r) => r.outcome !== 'created')
      .slice(0, 500),
  };
}

async function importClientRow(
  companyId: string,
  item: ClientPlan,
  mode: DuplicateMode,
): Promise<ReportRow> {
  const v = item.value!;
  if (item.outcome === 'duplicate') {
    if (mode !== 'fill_empty') {
      return { row: item.row, outcome: 'skipped', message: item.messages.join(' ') };
    }
    const current = await prisma.client.findFirst({ where: { id: item.existingId, companyId } });
    if (!current) return { row: item.row, outcome: 'skipped', message: 'Cadastro não encontrado.' };
    const data: Record<string, unknown> = {};
    for (const field of CLIENT_FILLABLE) {
      const incoming =
        field === 'birthDate'
          ? v.birthDate
            ? new Date(`${v.birthDate}T12:00:00Z`)
            : null
          : v[field];
      if (incoming != null && (current as Record<string, unknown>)[field] == null)
        data[field] = incoming;
    }
    if (!current.phone && v.phone) data.phone = v.phone;
    if (Object.keys(data).length === 0) {
      return {
        row: item.row,
        outcome: 'skipped',
        message: 'Já cadastrado; nada novo para completar.',
      };
    }
    await prisma.client.update({ where: { id: current.id }, data });
    return {
      row: item.row,
      outcome: 'updated',
      message: `Completados campos vazios: ${Object.keys(data).length}.`,
    };
  }
  await prisma.client.create({
    data: {
      companyId,
      name: v.name,
      phone: v.phone,
      email: v.email,
      cpf: v.cpf,
      birthDate: v.birthDate ? new Date(`${v.birthDate}T12:00:00Z`) : null,
      notes: v.notes,
      zipCode: v.zipCode,
      street: v.street,
      number: v.number,
      district: v.district,
      city: v.city,
      state: v.state,
    },
  });
  return { row: item.row, outcome: 'created', message: '' };
}

async function importProductRow(
  companyId: string,
  userId: string,
  item: ProductPlan,
): Promise<ReportRow> {
  const v = item.value!;
  if (item.outcome === 'duplicate') {
    return { row: item.row, outcome: 'skipped', message: item.messages.join(' ') };
  }
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        companyId,
        name: v.name,
        sku: v.sku,
        description: v.description,
        costPrice: v.costPrice ?? 0,
        salePrice: v.salePrice ?? 0,
        quantity: v.quantity ?? 0,
        minQuantity: v.minQuantity ?? 0,
      },
    });
    if ((v.quantity ?? 0) > 0) {
      await tx.stockMovement.create({
        data: {
          companyId,
          productId: product.id,
          type: 'IN',
          quantity: v.quantity!,
          reason: 'Saldo inicial (importação)',
          createdByUserId: userId,
        },
      });
    }
  });
  return { row: item.row, outcome: 'created', message: '' };
}

export async function listImportBatches(companyId: string) {
  const rows = await prisma.importBatch.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      kind: true,
      fileName: true,
      status: true,
      totalRows: true,
      created: true,
      updated: true,
      skipped: true,
      failed: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
