import { z } from 'zod';
import { runGuarded } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

const PageReadInput = z.object({
  pageId: z.string().min(1),
});
type PageReadInput = z.infer<typeof PageReadInput>;

const DatabaseQueryInput = z.object({
  databaseId: z.string().min(1),
  pageSize: z.number().int().positive().max(100).optional(),
});
type DatabaseQueryInput = z.infer<typeof DatabaseQueryInput>;

export const notionTools: ToolDefinition[] = [
  {
    name: 'notion_page_read',
    title: 'Read Notion page',
    description: 'Reads a Notion page by id (gated by policy).',
    inputSchema: PageReadInput.shape,
    handler: async (guard, raw) => {
      const input: PageReadInput = PageReadInput.parse(raw);
      return runGuarded(
        guard,
        '/notion/page/read',
        { page: input.pageId },
        { method: 'GET', path: `/pages/${input.pageId}` },
      );
    },
  },
  {
    name: 'notion_database_query',
    title: 'Query Notion database',
    description: 'Queries a Notion database (gated by policy).',
    inputSchema: DatabaseQueryInput.shape,
    handler: async (guard, raw) => {
      const input: DatabaseQueryInput = DatabaseQueryInput.parse(raw);
      return runGuarded(
        guard,
        '/notion/database/query',
        { database: input.databaseId },
        {
          method: 'POST',
          path: `/databases/${input.databaseId}/query`,
          body: input.pageSize !== undefined ? { page_size: input.pageSize } : {},
        },
      );
    },
  },
];
