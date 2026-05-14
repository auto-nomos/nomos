import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleCalendarResource = z
  .object({
    calendar_id: z.string().optional(),
    event_id: z.string().optional(),
  })
  .passthrough();

const ALL = [
  '/google/calendar/event/list',
  '/google/calendar/event/read',
  '/google/calendar/event/create',
  '/google/calendar/event/update',
  '/google/calendar/event/delete',
  '/google/calendar/event/quick_add',
  '/google/calendar/event/move',
  '/google/calendar/event/import',
  '/google/calendar/list/list',
  '/google/calendar/list/read',
  '/google/calendar/list/create',
  '/google/calendar/list/delete',
  '/google/calendar/freebusy/read',
];

export const googleCalendarActionSchemas: Partial<Record<string, ActionSchemas>> =
  Object.fromEntries(ALL.map((cmd) => [cmd, { resourceSchema: googleCalendarResource }]));
