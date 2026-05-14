import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleSheetsResource = z
  .object({
    spreadsheet_id: z.string().optional(),
    sheet_id: z.string().optional(),
    range: z.string().optional(),
  })
  .passthrough();

const ALL = [
  '/google/sheets/spreadsheet/create',
  '/google/sheets/spreadsheet/read',
  '/google/sheets/values/read',
  '/google/sheets/values/update',
  '/google/sheets/values/append',
  '/google/sheets/spreadsheet/batch_update',
];

export const googleSheetsActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  ALL.map((cmd) => [cmd, { resourceSchema: googleSheetsResource }]),
);
