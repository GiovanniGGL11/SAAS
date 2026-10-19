import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { checkClientRow, csvSafe, suggestMapping } from '@/lib/import';
import { analyzeColumns, previewImport, runImport } from '@/server/data/imports';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Importação assistida: mapeamento, duplicados exatos, idempotência, nada sobrescrito. Dados fictícios. */
describe('importação assistida', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('imp_a');
    other = await createTestCompany('imp_b');
    await prisma.client.create({
      data: { companyId: f.company.id, name: 'Ana Existente', phone: '11988887777', email: null },
    });
    // Mesmo telefone em OUTRA empresa não é duplicado aqui.
    await prisma.client.create({
      data: { companyId: other.company.id, name: 'Bruno Outra Empresa', phone: '11977776666' },
    });
    await prisma.product.create({
      data: {
        companyId: f.company.id,
        name: 'Luva Nitrílica',
        costPrice: 1,
        salePrice: 2,
        quantity: 10,
      },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('regras puras: colunas reconhecidas, data que não existe recusada, fórmula neutralizada', () => {
    const mapping = suggestMapping('clients', [
      'Nome completo',
      'Celular',
      'E-mail',
      'Data de nascimento',
    ]);
    expect(mapping).toMatchObject({ name: 0, phone: 1, email: 2, birthDate: 3 });
    expect(checkClientRow(['Ana', '', '', '31/02/1990'], mapping).errors[0]).toMatch(/nascimento/);
    expect(checkClientRow(['=HYPERLINK("x")', '', '', ''], mapping).value?.name).toBe(
      'HYPERLINK("x")',
    );
    expect(csvSafe('=1+1')).toBe("'=1+1");
    expect(csvSafe('-10,50')).toBe('-10,50');
    expect(csvSafe('+55 11')).toBe("'+55 11");
  });

  const clientsCsv = [
    'Nome;Telefone;E-mail;Cidade',
    'Ana Existente;(11) 98888-7777;ana@exemplo.com;Campinas', // já existe (telefone)
    'Carla Nova;11966665555;carla@exemplo.com;Santos', // nova
    'Carla Repetida;11966665555;;', // repete a linha 3
    ';11955554444;;', // sem nome
    'Bruno Novo Aqui;11977776666;;', // telefone igual ao de OUTRA empresa: novo aqui
    'ana existente;11911112222;;', // mesmo nome, outro telefone: aviso, não junta
  ].join('\n');

  it('prévia: novos, já existentes por chave exata, repetidos no arquivo e erros por linha', async () => {
    const analysis = analyzeColumns('clients', clientsCsv);
    const preview = await previewImport({
      companyId: f.company.id,
      kind: 'clients',
      text: clientsCsv,
      mapping: analysis.mapping,
    });
    expect(preview).toMatchObject({
      totalRows: 6,
      newRows: 3,
      duplicates: 1,
      duplicatesInFile: 1,
      invalid: 1,
    });
    expect(preview.rows.find((r) => r.row === 7)?.messages[0]).toMatch(/mesmo nome/);
    expect(await prisma.client.count({ where: { companyId: f.company.id } })).toBe(2); // nada gravado (padrão + Ana)
  });

  it('importa; repetir com o mesmo arquivo não duplica; completar vazios não troca nada', async () => {
    const { mapping } = analyzeColumns('clients', clientsCsv);
    const first = await runImport({
      companyId: f.company.id,
      userId: 'u',
      kind: 'clients',
      text: clientsCsv,
      mapping,
      duplicateMode: 'skip',
    });
    expect(first).toMatchObject({
      repeated: false,
      created: 3,
      updated: 0,
      failed: 1,
      status: 'PARTIAL',
    });
    expect(first.report.find((r) => r.row === 5)?.outcome).toBe('failed');
    const again = await runImport({
      companyId: f.company.id,
      userId: 'u',
      kind: 'clients',
      text: clientsCsv,
      mapping,
      duplicateMode: 'skip',
    });
    expect(again.repeated).toBe(true);
    expect(await prisma.client.count({ where: { companyId: f.company.id } })).toBe(5);

    // Outra escolha (completar vazios): Ana ganha e-mail e cidade; o nome dela não muda.
    const fill = await runImport({
      companyId: f.company.id,
      userId: 'u',
      kind: 'clients',
      text: clientsCsv,
      mapping,
      duplicateMode: 'fill_empty',
    });
    expect(fill.repeated).toBe(false);
    const ana = await prisma.client.findFirstOrThrow({
      where: { companyId: f.company.id, phone: '11988887777' },
    });
    expect(ana).toMatchObject({
      name: 'Ana Existente',
      email: 'ana@exemplo.com',
      city: 'Campinas',
    });
    expect(await prisma.client.count({ where: { companyId: f.company.id } })).toBe(5);
    // A outra empresa não foi tocada.
    expect(await prisma.client.count({ where: { companyId: other.company.id } })).toBe(2);
  });

  it('produtos: novo com saldo inicial registrado; existente nunca tem o estoque alterado', async () => {
    const csv = [
      'Produto;Custo;Preço;Quantidade',
      'Luva Nitrílica;1,50;3,00;99',
      'Algodão;R$ 4,90;9,90;12',
      'Gaze;abc;;',
    ].join('\n');
    const { mapping } = analyzeColumns('products', csv);
    const result = await runImport({
      companyId: f.company.id,
      userId: 'u',
      kind: 'products',
      text: csv,
      mapping,
      duplicateMode: 'skip',
    });
    expect(result).toMatchObject({ created: 1, skipped: 1, failed: 1 });
    const luva = await prisma.product.findFirstOrThrow({
      where: { companyId: f.company.id, name: 'Luva Nitrílica' },
    });
    expect(luva.quantity).toBe(10);
    const algodao = await prisma.product.findFirstOrThrow({
      where: { companyId: f.company.id, name: 'Algodão' },
    });
    expect(algodao.quantity).toBe(12);
    expect(Number(algodao.costPrice)).toBe(4.9);
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { productId: algodao.id },
    });
    expect(movement).toMatchObject({
      type: 'IN',
      quantity: 12,
      reason: 'Saldo inicial (importação)',
    });
  });
});
