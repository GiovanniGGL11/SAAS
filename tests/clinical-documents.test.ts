import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { DOCUMENT_KINDS, documentTemplate } from '@/lib/clinical-documents';
import {
  addAttachment,
  cancelClinicalDocument,
  createClinicalDocument,
  deleteAttachment,
  getDocumentForPrint,
  listAttachments,
  listClinicalDocuments,
  updateClientInsurance,
} from '@/server/data/clinical-documents';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('modelos de documento', () => {
  it('preenche paciente, data e hora', () => {
    const text = documentTemplate('declaracao', {
      patient: 'Maria Teste',
      date: '19/11/2026',
      time: '14:30',
    });
    expect(text).toContain('Maria Teste compareceu');
    expect(text).toContain('19/11/2026, às 14:30');
    expect(DOCUMENT_KINDS).toContain('receita');
  });
});

describe('documentos, convênio e anexos do prontuário', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('documentos');
    await prisma.professional.update({
      where: { id: f.professional.id },
      data: { name: 'Dra. Ana Teste', registry: 'CRO-RS 21' },
    });
  }, 60_000);
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('emite com o nome e o registro do dia; anular pede motivo e não anula duas vezes', async () => {
    const doc = await createClinicalDocument({
      companyId: f.company.id,
      clientId: f.client.id,
      kind: 'receita',
      title: 'Receituário',
      body: 'Uso tópico: pomada X, 2x ao dia por 7 dias.',
      professionalId: f.professional.id,
      authorUserId: 'u',
      authorName: 'Dona',
    });
    // Mudar o registro depois não muda o documento emitido.
    await prisma.professional.update({
      where: { id: f.professional.id },
      data: { registry: 'CRO-RS 99' },
    });
    const printed = await getDocumentForPrint(f.company.id, doc.id);
    expect(printed.professionalRegistry).toBe('CRO-RS 21');
    expect(printed.client.id).toBe(f.client.id);

    await expect(
      cancelClinicalDocument({
        companyId: f.company.id,
        clientId: f.client.id,
        id: doc.id,
        reason: '',
        userId: 'u',
        userName: 'Dona',
      }),
    ).rejects.toThrow(/por que/);
    await cancelClinicalDocument({
      companyId: f.company.id,
      clientId: f.client.id,
      id: doc.id,
      reason: 'Dose errada',
      userId: 'u',
      userName: 'Dona',
    });
    await expect(
      cancelClinicalDocument({
        companyId: f.company.id,
        clientId: f.client.id,
        id: doc.id,
        reason: 'De novo',
        userId: 'u',
        userName: 'Dona',
      }),
    ).rejects.toThrow(/já anulado/);
    const [listed] = await listClinicalDocuments(f.company.id, f.client.id);
    expect(listed.canceledAt).not.toBeNull();
    expect(listed.cancelReason).toBe('Dose errada');
  });

  it('não emite com tipo inválido, sem texto ou com profissional de outra empresa', async () => {
    const base = {
      companyId: f.company.id,
      clientId: f.client.id,
      title: 'X',
      authorUserId: 'u',
      authorName: 'Dona',
    };
    await expect(
      createClinicalDocument({
        ...base,
        kind: 'xpto',
        body: 'Texto',
        professionalId: f.professional.id,
      }),
    ).rejects.toThrow(/Tipo/);
    await expect(
      createClinicalDocument({
        ...base,
        kind: 'laudo',
        body: ' ',
        professionalId: f.professional.id,
      }),
    ).rejects.toThrow(/conteúdo/);
    const other = await createTestCompany('documentos_outra');
    try {
      await expect(
        createClinicalDocument({
          ...base,
          kind: 'laudo',
          body: 'Texto',
          professionalId: other.professional.id,
        }),
      ).rejects.toThrow(/profissional/);
      // A outra empresa não vê nem imprime o documento desta.
      const [doc] = await listClinicalDocuments(f.company.id, f.client.id);
      await expect(getDocumentForPrint(other.company.id, doc.id)).rejects.toThrow(/não encontrado/);
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });

  it('convênio e anexos', async () => {
    await updateClientInsurance({
      companyId: f.company.id,
      clientId: f.client.id,
      name: ' Unimed ',
      number: '123456',
      plan: null,
    });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: f.client.id } });
    expect(client).toMatchObject({
      insuranceName: 'Unimed',
      insuranceNumber: '123456',
      insurancePlan: null,
    });

    const row = await addAttachment({
      companyId: f.company.id,
      clientId: f.client.id,
      name: 'Hemograma.pdf',
      storagePath: `${f.company.id}/${f.client.id}/teste.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 1200,
      userId: 'u',
      userName: 'Dona',
    });
    expect((await listAttachments(f.company.id, f.client.id)).map((a) => a.name)).toEqual([
      'Hemograma.pdf',
    ]);
    const path = await deleteAttachment(f.company.id, f.client.id, row.id, 'u');
    expect(path).toContain('teste.pdf');
    expect(await listAttachments(f.company.id, f.client.id)).toHaveLength(0);
  });
});
