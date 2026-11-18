import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  describeToothMark,
  faceLayout,
  isValidTooth,
  normalizeToothMark,
  toothName,
} from '@/lib/odontogram';
import { areaAt, clinicalCharts, faceMapTotals, normalizeFacePoints } from '@/lib/face-map';
import { buildSummaryPrompt } from '@/lib/medical-summary';
import {
  addToothMark,
  cancelFaceMap,
  createFaceMap,
  listFaceMaps,
  listToothMarks,
  markToothDone,
  removeToothMark,
} from '@/server/data/clinical-charts';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Dados fictícios. */

describe('odontograma (regras)', () => {
  it('numeração FDI e nomes', () => {
    expect(toothName(36)).toBe('1º molar inferior esquerdo');
    expect(toothName(11)).toBe('Incisivo central superior direito');
    expect(toothName(55)).toBe('2º molar superior direito (de leite)');
    expect(isValidTooth(19)).toBe(false);
    expect(isValidTooth(56)).toBe(false);
    expect(isValidTooth(85)).toBe(true);
  });

  it('a mesial fica virada para o meio do desenho; vestibular por fora', () => {
    expect(faceLayout(16)).toEqual({ top: 'V', bottom: 'L', left: 'D', right: 'M' });
    expect(faceLayout(26)).toMatchObject({ left: 'M', right: 'D' });
    expect(faceLayout(36)).toEqual({ top: 'L', bottom: 'V', left: 'M', right: 'D' });
    expect(faceLayout(46)).toMatchObject({ left: 'D', right: 'M' });
  });

  it('cárie pede faces; canal vale para o dente inteiro', () => {
    expect(() =>
      normalizeToothMark({ tooth: 36, faces: [], condition: 'carie', status: 'planned' }),
    ).toThrow('faces');
    expect(
      normalizeToothMark({
        tooth: 36,
        faces: ['O', 'M', 'O', 'X'],
        condition: 'carie',
        status: 'planned',
      }).faces,
    ).toEqual(['M', 'O']);
    expect(
      normalizeToothMark({ tooth: 36, faces: ['O'], condition: 'canal', status: 'done' }).faces,
    ).toEqual([]);
    expect(() =>
      normalizeToothMark({ tooth: 99, faces: [], condition: 'canal', status: 'done' }),
    ).toThrow('Dente inválido');
    expect(() =>
      normalizeToothMark({ tooth: 36, faces: [], condition: 'canal', status: 'talvez' }),
    ).toThrow('a fazer ou feito');
    expect(
      describeToothMark({ tooth: 36, faces: ['M', 'O'], condition: 'carie', status: 'planned' }),
    ).toBe('36 · Cárie (M, O) · a fazer');
  });
});

describe('mapa facial (regras)', () => {
  it('sugere a região pela posição, com o lado do paciente', () => {
    expect(areaAt(50, 15)).toBe('Testa');
    expect(areaAt(50, 32)).toBe('Glabela');
    expect(areaAt(20, 40)).toBe('Pés de galinha direito');
    expect(areaAt(80, 40)).toBe('Pés de galinha esquerdo');
    expect(areaAt(50, 73)).toBe('Lábios');
    expect(areaAt(50, 88)).toBe('Mento (queixo)');
  });

  it('confere os pontos e soma por produto', () => {
    expect(() => normalizeFacePoints([])).toThrow('pelo menos um ponto');
    expect(() => normalizeFacePoints([{ x: 50, y: 15, amount: -1 }])).toThrow('Quantidade');
    const points = normalizeFacePoints([
      { x: 150, y: 15, product: 'Toxina A', amount: 4, unit: 'U' },
      { x: 30, y: 15, product: 'toxina a', amount: '4', unit: 'xpto' },
      { x: 50, y: 73, product: 'Ácido', amount: 0.5, unit: 'ml', area: 'Lábio superior' },
      { x: 50, y: 50, product: 'Ácido', amount: null, unit: 'ml' },
    ]);
    expect(points[0]).toMatchObject({ x: 100, area: 'Testa' });
    expect(points[1].unit).toBe('U');
    expect(points[2].area).toBe('Lábio superior');
    expect(faceMapTotals(points)).toEqual([
      { product: 'Toxina A', unit: 'U', amount: 8 },
      { product: 'Ácido', unit: 'ml', amount: 0.5 },
    ]);
  });

  it('cada ramo ganha o que usa', () => {
    expect(clinicalCharts('odonto')).toEqual({ odontogram: true, faceMap: true });
    expect(clinicalCharts('estetica')).toEqual({ odontogram: false, faceMap: true });
    expect(clinicalCharts('psicologia')).toEqual({ odontogram: false, faceMap: false });
  });

  it('o resumo com IA recebe o que está a fazer no odontograma e as aplicações', () => {
    const text = buildSummaryPrompt(
      {
        age: 30,
        clientNotes: null,
        alerts: [],
        nextAppointment: null,
        lastVisit: null,
        returnSuggestion: null,
        notes: [],
        plan: [],
        dentalPending: ['36 · Cárie (O) · a fazer'],
        faceMaps: ['10/11/2026: Toxina (Toxina A 8 U) em Testa'],
      },
      'America/Sao_Paulo',
    );
    expect(text).toContain('## Odontograma: a fazer\n- 36 · Cárie (O) · a fazer');
    expect(text).toContain('Toxina A 8 U');
  });
});

describe('odontograma e mapa facial no banco', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('odontograma');
    other = await createTestCompany('odontograma_outra');
  }, 60_000);
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('marca a fazer, passa para feito e remove guardando o histórico', async () => {
    const mark = await addToothMark({
      companyId: f.company.id,
      clientId: f.client.id,
      mark: { tooth: 36, faces: ['O'], condition: 'carie', status: 'planned' },
      userId: 'u',
      userName: 'Dra. Teste',
    });
    expect(mark.doneAt).toBeNull();
    const ref = { companyId: f.company.id, clientId: f.client.id, id: mark.id, userName: 'Dra.' };

    // Outra empresa não vê nem mexe.
    expect(await listToothMarks(other.company.id, f.client.id)).toHaveLength(0);
    await expect(markToothDone({ ...ref, companyId: other.company.id })).rejects.toThrow(
      'não encontrada',
    );

    await markToothDone(ref);
    await expect(markToothDone(ref)).rejects.toThrow('já está como feita');
    await removeToothMark(ref);
    await expect(removeToothMark(ref)).rejects.toThrow('já foi removida');

    const [row] = await listToothMarks(f.company.id, f.client.id);
    expect(row).toMatchObject({ status: 'done', doneByName: 'Dra.', removedByName: 'Dra.' });
    expect(row.removedAt).not.toBeNull();

    // Marcação já feita nasce com a data de feita.
    const existing = await addToothMark({
      companyId: f.company.id,
      clientId: f.client.id,
      mark: { tooth: 11, faces: [], condition: 'coroa', status: 'done' },
      userId: 'u',
      userName: 'Dra. Teste',
    });
    expect(existing.doneAt).not.toBeNull();
    await expect(
      addToothMark({
        companyId: other.company.id,
        clientId: f.client.id,
        mark: { tooth: 11, faces: [], condition: 'coroa', status: 'done' },
        userId: 'u',
        userName: 'X',
      }),
    ).rejects.toThrow('Paciente não encontrado');
  });

  it('registra a aplicação; anular pede motivo e não anula duas vezes', async () => {
    await expect(
      createFaceMap({
        companyId: f.company.id,
        clientId: f.client.id,
        title: ' ',
        points: [{ x: 50, y: 15 }],
        userId: 'u',
        userName: 'Dra.',
      }),
    ).rejects.toThrow('procedimento');
    await expect(
      createFaceMap({
        companyId: f.company.id,
        clientId: f.client.id,
        title: 'Toxina',
        points: [{ x: 50, y: 15 }],
        professionalId: other.professional.id,
        userId: 'u',
        userName: 'Dra.',
      }),
    ).rejects.toThrow('Profissional');

    const map = await createFaceMap({
      companyId: f.company.id,
      clientId: f.client.id,
      title: 'Toxina botulínica',
      points: [
        { x: 50, y: 15, product: 'Toxina A', amount: 10, unit: 'U' },
        { x: 50, y: 32, product: 'Toxina A', amount: 8, unit: 'U' },
      ],
      notes: 'Lote 123',
      professionalId: f.professional.id,
      userId: 'u',
      userName: 'Dra.',
    });
    const [listed] = await listFaceMaps(f.company.id, f.client.id);
    expect(listed.points.map((p) => p.area)).toEqual(['Testa', 'Glabela']);
    expect(await listFaceMaps(other.company.id, f.client.id)).toHaveLength(0);

    const ref = { companyId: f.company.id, clientId: f.client.id, id: map.id, userName: 'Dra.' };
    await expect(cancelFaceMap({ ...ref, reason: '' })).rejects.toThrow('por que');
    await cancelFaceMap({ ...ref, reason: 'Quantidade errada' });
    await expect(cancelFaceMap({ ...ref, reason: 'De novo' })).rejects.toThrow('já foi anulada');
    const [canceled] = await listFaceMaps(f.company.id, f.client.id);
    expect(canceled.cancelReason).toBe('Quantidade errada');
  });
});
