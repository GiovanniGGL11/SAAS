import { after } from 'next/server';

import { syncAppointmentToGoogle } from '@/server/data/google-calendar';

/**
 * Google Calendar sync runs after the response, so saving an appointment never waits on
 * Google (or fails because of it). Failures are logged inside the sync itself.
 */
export function scheduleGoogleSync(companyId: string, appointmentIds: string[]): void {
  const ids = [...new Set(appointmentIds)];
  if (ids.length === 0) return;

  after(async () => {
    for (const id of ids) {
      await syncAppointmentToGoogle(companyId, id).catch((error) =>
        console.error('[google-calendar] unexpected sync error', error),
      );
    }
  });
}
