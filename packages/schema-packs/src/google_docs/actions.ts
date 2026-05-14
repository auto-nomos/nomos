/**
 * Mapping from `packages/adapters/spec/google_docs.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/docs/...` for
 * symmetry with the rest of the google surface.
 */

export const actionToCommand: Record<string, string> = {
  create_document: '/google/docs/document/create',
  get_document: '/google/docs/document/read',
  batch_update: '/google/docs/document/batch_update',
  replace_text: '/google/docs/document/replace_text',
  insert_text: '/google/docs/document/insert_text',
  delete_text: '/google/docs/document/delete_text',
  format_text: '/google/docs/document/format_text',
  insert_table: '/google/docs/document/insert_table',
  insert_image: '/google/docs/document/insert_image',
  create_named_range: '/google/docs/document/named_range/create',
  get_revisions: '/google/docs/document/revisions/read',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const documentId = typeof params.documentId === 'string' ? params.documentId : undefined;

  switch (actionId) {
    case 'create_document':
      return {};
    case 'get_document':
    case 'batch_update':
    case 'replace_text':
    case 'insert_text':
    case 'delete_text':
    case 'format_text':
    case 'insert_table':
    case 'insert_image':
    case 'create_named_range':
    case 'get_revisions':
      return documentId ? { document: documentId } : {};
    default:
      return {};
  }
}
