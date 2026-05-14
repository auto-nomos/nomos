/**
 * Parse a Google Calendar API path. api_base is
 * `https://www.googleapis.com/calendar/v3`, so the path strips `/calendar/v3`:
 *   /calendars
 *   /calendars/{calendarId}
 *   /calendars/{calendarId}/events
 *   /calendars/{calendarId}/events/{eventId}
 *   /calendars/{calendarId}/events/quickAdd
 *   /calendars/{calendarId}/events/import
 *   /calendars/{calendarId}/events/{eventId}/move
 *   /users/me/calendarList
 *   /freeBusy
 */
export function parseGoogleCalendarPath(path: string): {
  calendar_id?: string;
  event_id?: string;
  namespace?: 'calendars' | 'calendarList' | 'freeBusy';
  action?: 'quickAdd' | 'import' | 'move';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] === 'freeBusy') return { namespace: 'freeBusy' };
  if (segs[0] === 'users' && segs[2] === 'calendarList') return { namespace: 'calendarList' };
  if (segs[0] !== 'calendars') return null;
  const out: ReturnType<typeof parseGoogleCalendarPath> = { namespace: 'calendars' };
  if (segs[1]) out!.calendar_id = segs[1];
  if (segs[2] === 'events') {
    if (segs[3] === 'quickAdd') out!.action = 'quickAdd';
    else if (segs[3] === 'import') out!.action = 'import';
    else if (segs[3]) {
      out!.event_id = segs[3];
      if (segs[4] === 'move') out!.action = 'move';
    }
  }
  return out;
}
