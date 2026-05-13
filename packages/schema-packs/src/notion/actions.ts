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
  update_page: '/notion/page/update',
  get_database: '/notion/database/read',
  list_users: '/notion/user/list',
  get_user: '/notion/user/read',
  delete_block: '/notion/block/delete',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const pageId = typeof params.page_id === 'string' ? params.page_id : undefined;
  const blockId = typeof params.block_id === 'string' ? params.block_id : undefined;
  const databaseId = typeof params.database_id === 'string' ? params.database_id : undefined;
  const userId = typeof params.user_id === 'string' ? params.user_id : undefined;

  switch (actionId) {
    case 'search':
    case 'create_page':
    case 'list_users':
      return {};
    case 'get_page':
    case 'update_page':
      return pageId ? { page: pageId } : {};
    case 'list_block_children':
    case 'append_block_children':
    case 'delete_block':
      return blockId ? { block: blockId } : {};
    case 'query_database':
    case 'get_database':
      return databaseId ? { database: databaseId } : {};
    case 'get_user':
      return userId ? { user: userId } : {};
    default:
      return {};
  }
}
