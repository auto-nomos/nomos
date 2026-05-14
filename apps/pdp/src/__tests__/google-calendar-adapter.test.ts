import type { GoogleCalendarConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleCalendarProxyCall } from '../adapters/google_calendar.js';

describe('validateGoogleCalendarProxyCall', () => {
  const eventConstraint: GoogleCalendarConstraint = {
    provider: 'google_calendar',
    calendar_id: 'cal_primary',
    event_id: 'evt_1',
  };

  it('allows in-scope read of the pinned event', () => {
    expect(
      validateGoogleCalendarProxyCall(eventConstraint, {
        method: 'GET',
        path: '/calendars/cal_primary/events/evt_1',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a different event under the same calendar', () => {
    expect(
      validateGoogleCalendarProxyCall(eventConstraint, {
        method: 'DELETE',
        path: '/calendars/cal_primary/events/evt_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'event_mismatch' });
  });

  it('rejects an event under a different calendar', () => {
    expect(
      validateGoogleCalendarProxyCall(eventConstraint, {
        method: 'GET',
        path: '/calendars/cal_OTHER/events/evt_1',
      }),
    ).toEqual({ ok: false, reason: 'calendar_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateGoogleCalendarProxyCall(eventConstraint, {
        method: 'GET',
        path: '/files/abc',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
