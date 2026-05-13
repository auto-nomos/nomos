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
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const documentId =
    typeof params.documentId === 'string' ? params.documentId : undefined;

  switch (actionId) {
    case 'create_document':
      return {};
    case 'get_document':
    case 'batch_update':
    case 'replace_text':
      return documentId ? { document: documentId } : {};
    default:
      return {};
  }
}
