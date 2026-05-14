import type { PolicyTemplate } from '../types.js';

/**
 * Google Calendar vocabulary. Reuses the google OAuth connector — the
 * dashboard requests the calendar scope (`https://www.googleapis.com/auth/calendar`)
 * alongside the existing google scopes when this pack is enabled.
 */
export const READS = [
  '/google/calendar/event/read',
  '/google/calendar/event/list',
  '/google/calendar/list/list',
  '/google/calendar/list/read',
  '/google/calendar/meta/read',
  '/google/calendar/acl/list',
  '/google/calendar/settings/read',
  '/google/calendar/freebusy/read',
] as const;
export const WRITES = [
  '/google/calendar/event/create',
  '/google/calendar/event/update',
  '/google/calendar/event/delete',
  '/google/calendar/event/quick_add',
  '/google/calendar/event/move',
  '/google/calendar/event/import',
  '/google/calendar/event/respond',
  '/google/calendar/list/create',
  '/google/calendar/list/clear',
] as const;
export const DELETES = ['/google/calendar/list/delete'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_calendar:read-only',
    integrationId: 'google_calendar',
    name: 'Read-only',
    description: 'List + read events on visible calendars. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_calendar:scheduling',
    integrationId: 'google_calendar',
    name: 'Scheduling helper',
    description: 'Read + create + update events. Cannot delete.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/calendar/event/create", Action::"/google/calendar/event/update"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_calendar:step-up-delete',
    integrationId: 'google_calendar',
    name: 'Step-up to delete',
    description: 'Read + create + update freely; deleting an event requires co-signer.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/calendar/event/create", Action::"/google/calendar/event/update"],\n  resource\n);\n\npermit (\n  principal,\n  action == Action::"/google/calendar/event/delete",\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google_calendar:full-write',
    integrationId: 'google_calendar',
    name: 'Full write',
    description: 'All read + write actions including delete. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_calendar:read-and-create-only',
    integrationId: 'google_calendar',
    name: 'Read + create only',
    description: 'Read everything; create new events. Cannot update or delete.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/calendar/event/create"],\n  resource\n);`,
    visualReady: true,
  },
];
