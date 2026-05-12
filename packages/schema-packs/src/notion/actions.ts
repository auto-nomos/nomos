/**
 * Mapping from `packages/adapters/spec/notion.yaml` action ids to canonical
 * Cedar commands. See `../github/actions.ts` for the design rationale.
 */

export const actionToCommand: Record<string, string> = {
  search: '/notion/search',
  get_page: '/notion/page/read',
  list_block_children: '/notion/block/read',
  append_block_children: '/notion/block/append',
  create_page: '/notion/page/create',
  query_database: '/notion/database/query',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const pageId = typeof params.page_id === 'string' ? params.page_id : undefined;
  const blockId = typeof params.block_id === 'string' ? params.block_id : undefined;
  const databaseId = typeof params.database_id === 'string' ? params.database_id : undefined;

  switch (actionId) {
    case 'search':
    case 'create_page':
      return {};
    case 'get_page':
      return pageId ? { page: pageId } : {};
    case 'list_block_children':
    case 'append_block_children':
      return blockId ? { block: blockId } : {};
    case 'query_database':
      return databaseId ? { database: databaseId } : {};
    default:
      return {};
  }
}
