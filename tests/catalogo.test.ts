import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { priceLabel } from '@/lib/catalog';
import { createPublicBooking, getBookingCatalog } from '@/server/data/public-booking';
import { createService, updateService } from '@/server/data/services';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('catálogo: tipo de preço e visibilidade no agendamento online', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('catalogo');
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('rótulo do preço nunca mostra valor em "sob consulta"', () => {
    expect(priceLabel(80, 'fixed')).toMatch(/R\$\s?80,00/);
    expect(priceLabel(80, undefined)).toMatch(/R\$\s?80,00/);
    expect(priceLabel(80, 'from')).toMatch(/^a partir de R\$\s?80,00$/);
    expect(priceLabel(80, 'on_request')).toBe('Sob consulta');
  });

  it('serviço interno some do link público e não aceita reserva por ele', async () => {
    const internal = await createService(f.company.id, {
      name: 'Avaliação interna (teste)',
      durationMinutes: 30,
      price: 0,
      color: '#888888',
      priceKind: 'on_request',
      publicVisible: false,
    });
    expect(internal).toMatchObject({ priceKind: 'on_request', publicVisible: false });

    const catalog = await getBookingCatalog(f.company.id);
    expect(catalog.services.map((s) => s.id)).not.toContain(internal.id);
    expect(catalog.services.find((s) => s.id === f.service.id)).toMatchObject({
      priceKind: 'fixed',
    });
    // Nada interno no que vai para o navegador.
    expect(Object.keys(catalog.services[0]).sort()).toEqual(
      ['description', 'durationMinutes', 'id', 'name', 'price', 'priceKind'].sort(),
    );

    await expect(
      createPublicBooking({
        companyId: f.company.id,
        timezone: 'America/Sao_Paulo',
        serviceId: internal.id,
        professionalId: f.professional.id,
        startAt: new Date(Date.now() + 7 * 86_400_000),
        name: 'Cliente Fictício',
        phone: '(11) 97777-1234',
      }),
    ).rejects.toThrow(/indisponível/);

    // Editar sem mandar os campos mantém o que estava; liberar faz aparecer.
    await updateService(f.company.id, internal.id, {
      name: 'Avaliação (teste)',
      durationMinutes: 30,
      price: 0,
      color: '#888888',
    });
    expect((await getBookingCatalog(f.company.id)).services.map((s) => s.id)).not.toContain(
      internal.id,
    );
    await updateService(f.company.id, internal.id, {
      name: 'Avaliação (teste)',
      durationMinutes: 30,
      price: 120,
      color: '#888888',
      priceKind: 'from',
      publicVisible: true,
    });
    expect(
      (await getBookingCatalog(f.company.id)).services.find((s) => s.id === internal.id),
    ).toMatchObject({ priceKind: 'from', price: 120 });
  });
});
