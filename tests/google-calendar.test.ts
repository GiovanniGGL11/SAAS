import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  createAppointment,
  moveAppointment,
} from '@/server/data/appointments';
import {
  getConnectionStatus,
  saveConnection,
  setConnectionProfessionals,
  syncAppointmentToGoogle,
} from '@/server/data/google-calendar';
import { decryptSecret, encryptSecret } from '@/server/google/crypto';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

type FakeEvent = { summary: string; description?: string; start: { dateTime: string } };

/** In-memory stand-in for Google's token and Calendar endpoints. */
function installFakeGoogle() {
  const events = new Map<string, FakeEvent>();
  const calls: string[] = [];
  const state = { tokenError: null as string | null, vanishOnPatch: false, seq: 0 };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return state.tokenError ? json({ error: state.tokenError }, 400) : json({ access_token: 'at' });
      }
      if (url.startsWith('https://oauth2.googleapis.com/revoke')) return json({});

      const eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      if (!url.startsWith(eventUrl)) throw new Error(`Unexpected fetch: ${method} ${url}`);
      const id = decodeURIComponent(url.slice(eventUrl.length + 1));
      calls.push(`${method} ${id || '(new)'}`.trim());

      const body = init?.body ? (JSON.parse(String(init.body)) as FakeEvent) : null;
      if (method === 'POST') {
        const newId = `evt_${++state.seq}`;
        events.set(newId, body!);
        return json({ id: newId });
      }
      if (method === 'PATCH') {
        if (state.vanishOnPatch || !events.has(id)) return json({}, 404);
        events.set(id, { ...events.get(id)!, ...body! });
        return json({ id });
      }
      if (method === 'DELETE') {
        if (!events.delete(id)) return json({}, 404);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected method ${method}`);
    }),
  );
  return { events, calls, state };
}

async function appointmentFor(fixture: Fixture, startAt: string, professionalId?: string) {
  return createAppointment({
    companyId: fixture.company.id,
    clientId: fixture.client.id,
    professionalId: professionalId ?? fixture.professional.id,
    serviceId: fixture.service.id,
    startAt: new Date(startAt),
    createdByUserId: 'user_test',
  });
}

async function connect(fixture: Fixture, professionalIds: string[], userId = 'user_a') {
  return saveConnection({
    companyId: fixture.company.id,
    userId,
    googleEmail: `${userId}@example.com`,
    refreshToken: 'refresh-secret',
    professionalIds,
  });
}

describe('google calendar token encryption', () => {
  it('round-trips, never stores plaintext, and rejects tampering', () => {
    const encrypted = encryptSecret('1//refresh-token');
    expect(encrypted).not.toContain('refresh-token');
    expect(decryptSecret(encrypted)).toBe('1//refresh-token');
    // Fresh IV each time: same input never produces the same ciphertext.
    expect(encryptSecret('1//refresh-token')).not.toBe(encrypted);

    const [version, iv, tag, data] = encrypted.split('.');
    const flipped = `${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`;
    expect(() => decryptSecret([version, iv, tag, flipped].join('.'))).toThrow();
  });
});

describe('google calendar sync', () => {
  let fixture: Fixture;
  let google: ReturnType<typeof installFakeGoogle>;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    google = installFakeGoogle();
    fixture = await createTestCompany('gcal');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(fixture.company.id);
  });

  it('creates, updates and removes the event as the appointment changes', async () => {
    const connection = await connect(fixture, [fixture.professional.id]);
    const appointment = await appointmentFor(fixture, '2030-07-01T13:00:00Z');

    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect(google.events.size).toBe(1);
    const created = [...google.events.values()][0];
    expect(created.summary).toBe(`${fixture.service.name} — ${fixture.client.name}`);
    expect(created.description).toContain(fixture.client.name);

    // Syncing again must update the same event, not duplicate it.
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect(google.events.size).toBe(1);

    await moveAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      startAt: new Date('2030-07-01T15:00:00Z'),
      updatedByUserId: 'user_test',
    });
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect([...google.events.values()][0].start.dateTime).toBe('2030-07-01T15:00:00.000Z');

    await cancelAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      canceledByUserId: 'user_test',
    });
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect(google.events.size).toBe(0);
    expect(await prisma.googleCalendarEvent.count({ where: { connectionId: connection.id } })).toBe(0);
  });

  it('only mirrors the professionals the user picked', async () => {
    const other = await prisma.professional.create({
      data: { companyId: fixture.company.id, name: 'Outro', color: '#ff0000' },
    });
    await connect(fixture, [fixture.professional.id]);

    const mine = await appointmentFor(fixture, '2030-07-02T13:00:00Z');
    const theirs = await appointmentFor(fixture, '2030-07-02T13:00:00Z', other.id);
    await syncAppointmentToGoogle(fixture.company.id, mine.id);
    await syncAppointmentToGoogle(fixture.company.id, theirs.id);
    expect(google.events.size).toBe(1);

    // Dragging my appointment to the other professional takes it off my calendar.
    await moveAppointment({
      companyId: fixture.company.id,
      id: mine.id,
      startAt: new Date('2030-07-02T16:00:00Z'),
      professionalId: other.id,
      updatedByUserId: 'user_test',
    });
    await syncAppointmentToGoogle(fixture.company.id, mine.id);
    expect(google.events.size).toBe(0);
  });

  it('recreates an event the user deleted in Google', async () => {
    await connect(fixture, [fixture.professional.id]);
    const appointment = await appointmentFor(fixture, '2030-07-03T13:00:00Z');
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);

    google.events.clear(); // user removed it from their calendar
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect(google.events.size).toBe(1);
  });

  it('pauses the connection when Google revokes access, without throwing', async () => {
    const connection = await connect(fixture, [fixture.professional.id]);
    const appointment = await appointmentFor(fixture, '2030-07-04T13:00:00Z');

    google.state.tokenError = 'invalid_grant';
    await expect(syncAppointmentToGoogle(fixture.company.id, appointment.id)).resolves.toBeUndefined();

    const status = await getConnectionStatus(fixture.company.id, connection.userId);
    expect(status.needsReconnect).toBe(true);

    // While paused, nothing is sent to Google at all.
    google.calls.length = 0;
    await syncAppointmentToGoogle(fixture.company.id, appointment.id);
    expect(google.calls).toEqual([]);
  });

  it('copies upcoming appointments when professionals are added and clears them when removed', async () => {
    await connect(fixture, []);
    const appointment = await appointmentFor(fixture, '2030-07-05T13:00:00Z');
    expect(google.events.size).toBe(0);

    await setConnectionProfessionals(fixture.company.id, 'user_a', [fixture.professional.id]);
    expect(google.events.size).toBe(1);
    expect(await prisma.googleCalendarEvent.count({ where: { appointmentId: appointment.id } })).toBe(1);

    await setConnectionProfessionals(fixture.company.id, 'user_a', []);
    expect(google.events.size).toBe(0);
  });

  it('ignores professional ids from another company and never leaks across companies', async () => {
    const other = await createTestCompany('gcal-other');
    try {
      const connection = await saveConnection({
        companyId: other.company.id,
        userId: 'user_b',
        googleEmail: 'b@example.com',
        refreshToken: 'x',
        // Our professional's id smuggled into the other company's connection.
        professionalIds: [fixture.professional.id, other.professional.id],
      });
      expect(connection.professionalIds).toEqual([other.professional.id]);

      const appointment = await appointmentFor(fixture, '2030-07-06T13:00:00Z');
      await syncAppointmentToGoogle(fixture.company.id, appointment.id);
      expect(google.events.size).toBe(0);
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });
});
