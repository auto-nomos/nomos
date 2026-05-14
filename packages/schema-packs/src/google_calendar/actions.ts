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
  quick_add: '/google/calendar/event/quick_add',
  create_calendar: '/google/calendar/list/create',
  delete_calendar: '/google/calendar/list/delete',
  move_event: '/google/calendar/event/move',
  import_event: '/google/calendar/event/import',
  get_calendar_meta: '/google/calendar/meta/read',
  list_acl: '/google/calendar/acl/list',
  get_settings: '/google/calendar/settings/read',
  respond_to_event: '/google/calendar/event/respond',
  clear_calendar: '/google/calendar/list/clear',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const calendarId = typeof params.calendarId === 'string' ? params.calendarId : undefined;
  const eventId = typeof params.eventId === 'string' ? params.eventId : undefined;

  switch (actionId) {
    case 'list_calendars':
    case 'list_attendees_freebusy':
    case 'create_calendar':
    case 'get_settings':
      return {};
    case 'list_events':
    case 'get_calendar':
    case 'delete_calendar':
    case 'quick_add':
    case 'import_event':
    case 'get_calendar_meta':
    case 'list_acl':
    case 'clear_calendar':
      return calendarId ? { calendar: calendarId } : {};
    case 'get_event':
    case 'create_event':
    case 'update_event':
    case 'delete_event':
    case 'move_event':
    case 'respond_to_event':
      return {
        ...(calendarId ? { calendar: calendarId } : {}),
        ...(eventId ? { event: eventId } : {}),
      };
    default:
      return {};
  }
}
