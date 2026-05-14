import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleContactsResource = z
  .object({
    resource_name: z.string().optional(),
  })
  .passthrough();

const ALL = ['/google/contacts/list', '/google/contacts/search', '/google/contacts/read'];

export const googleContactsActionSchemas: Partial<Record<string, ActionSchemas>> =
  Object.fromEntries(ALL.map((cmd) => [cmd, { resourceSchema: googleContactsResource }]));
