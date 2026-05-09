import { z } from 'zod';
import { runGuarded } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

const DriveListInput = z.object({
  query: z.string().optional(),
  pageSize: z.number().int().positive().max(1000).optional(),
});
type DriveListInput = z.infer<typeof DriveListInput>;

export const googleTools: ToolDefinition[] = [
  {
    name: 'google_drive_list',
    title: 'List Google Drive files',
    description: 'Lists files in Google Drive (gated by policy).',
    inputSchema: DriveListInput.shape,
    handler: async (guard, raw) => {
      const input: DriveListInput = DriveListInput.parse(raw);
      const query: Record<string, string> = {};
      if (input.query !== undefined) query.q = input.query;
      if (input.pageSize !== undefined) query.pageSize = String(input.pageSize);
      return runGuarded(
        guard,
        '/google/drive/list',
        {},
        {
          method: 'GET',
          path: '/drive/v3/files',
          ...(Object.keys(query).length ? { query } : {}),
        },
      );
    },
  },
];
