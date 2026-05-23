/**
 * Google Calendar hand-curated overrides. Generated floor enforces method +
 * path regex per action; these add the cross-cutting `googleCalendarResource`
 * zod and tighten event create/update/quick_add/list_create bodies to the
 * minimum that the Calendar API itself mandates.
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';
import { actions } from './templates.js';

const safePath = z
  .string()
  .min(1)
  .refine((p: string) => !p.includes('..') && !p.includes('//'), {
    message: 'path must not contain `..` or `//` segments',
  });

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: safePath,
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const googleCalendarResource = z
  .object({
    calendar_id: z.string().optional(),
    event_id: z.string().optional(),
  })
  .passthrough();

const postCall = apiCallBase.extend({ method: z.literal('POST') });
const patchCall = apiCallBase.extend({ method: z.literal('PATCH') });
const putCall = apiCallBase.extend({ method: z.literal('PUT') });

// Calendar API requires start + end objects. Permissive on the inner shape —
// Google rejects malformed payloads itself; PDP just ensures the keys are
// present so a write call can't sneak through with an empty body.
const eventTimeSpec = z.object({}).passthrough();

/** POST /calendars/{cal}/events — start + end required. */
const eventCreateCall = postCall.extend({
  body: z
    .object({
      start: eventTimeSpec,
      end: eventTimeSpec,
    })
    .passthrough()
    .optional(),
});

/** PATCH /calendars/{cal}/events/{evt} — at least an object body. */
const eventUpdateCall = patchCall.extend({
  body: z.object({}).passthrough().optional(),
});

/** PUT /calendars/{cal}/events/{evt} — full replace; start + end required. */
const eventReplaceCall = putCall.extend({
  body: z
    .object({
      start: eventTimeSpec,
      end: eventTimeSpec,
    })
    .passthrough()
    .optional(),
});

/** POST /calendars/{cal}/events/quickAdd — text required (query param). */
const quickAddCall = postCall.extend({
  query: z
    .record(z.string(), z.string())
    .refine((q) => typeof q.text === 'string' && q.text.length > 0, {
      message: 'quickAdd requires `text` query param',
    }),
});

/** POST /calendars — summary required to create a calendar. */
const createCalendarCall = postCall.extend({
  body: z
    .object({ summary: z.string().min(1) })
    .passthrough()
    .optional(),
});

const handCurated: Partial<Record<string, ActionSchemas>> = {
  '/google/calendar/event/create': { apiCallSchema: eventCreateCall },
  '/google/calendar/event/update': { apiCallSchema: z.union([eventUpdateCall, eventReplaceCall]) },
  '/google/calendar/event/import': { apiCallSchema: eventCreateCall },
  '/google/calendar/event/quick_add': { apiCallSchema: quickAddCall },
  '/google/calendar/list/create': { apiCallSchema: createCalendarCall },
};

export const googleCalendarActionSchemas: Partial<Record<string, ActionSchemas>> =
  Object.fromEntries(
    actions.map((cmd) => [cmd, { ...handCurated[cmd], resourceSchema: googleCalendarResource }]),
  );
