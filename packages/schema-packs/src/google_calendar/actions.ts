/**
 * Mapping from `packages/adapters/spec/google_calendar.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/calendar/...` to
 * stay consistent with existing template strings and the shared `google`
 * OAuth connector.
 */

export const actionToCommand: Record<string, string> = {
  list_events: '/google/calendar/event/list',
  get_event: '/google/calendar/event/read',
  create_event: '/google/calendar/event/create',
  update_event: '/google/calendar/event/update',
  delete_event: '/google/calendar/event/delete',
  list_calendars: '/google/calendar/list/list',
  get_calendar: '/google/calendar/list/read',
  list_attendees_freebusy: '/google/calendar/freebusy/read',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const calendarId =
    typeof params.calendarId === 'string' ? params.calendarId : undefined;
  const eventId = typeof params.eventId === 'string' ? params.eventId : undefined;

  switch (actionId) {
    case 'list_calendars':
    case 'list_attendees_freebusy':
      return {};
    case 'list_events':
    case 'get_calendar':
      return calendarId ? { calendar: calendarId } : {};
    case 'get_event':
    case 'create_event':
    case 'update_event':
    case 'delete_event':
      return {
        ...(calendarId ? { calendar: calendarId } : {}),
        ...(eventId ? { event: eventId } : {}),
      };
    default:
      return {};
  }
}
