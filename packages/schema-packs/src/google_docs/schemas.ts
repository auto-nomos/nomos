import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleDocsResource = z
  .object({
    document_id: z.string().optional(),
  })
  .passthrough();

const ALL = [
  '/google/docs/document/create',
  '/google/docs/document/read',
  '/google/docs/document/batch_update',
  '/google/docs/document/replace_text',
];

export const googleDocsActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  ALL.map((cmd) => [cmd, { resourceSchema: googleDocsResource }]),
);
