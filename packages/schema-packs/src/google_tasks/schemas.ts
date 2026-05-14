import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleTasksResource = z
  .object({
    tasklist_id: z.string().optional(),
    task_id: z.string().optional(),
  })
  .passthrough();

const ALL = [
  '/google/tasks/tasklist/list',
  '/google/tasks/list',
  '/google/tasks/read',
  '/google/tasks/create',
  '/google/tasks/update',
  '/google/tasks/delete',
];

export const googleTasksActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  ALL.map((cmd) => [cmd, { resourceSchema: googleTasksResource }]),
);
