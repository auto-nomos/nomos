/**
 * Mapping from `packages/adapters/spec/google_drive.yaml` action ids to
 * canonical Cedar commands. The schema-packs `google` pack covers Drive
 * for now; calendar lives in its own pack. See `../github/actions.ts` for
 * the design rationale.
 */

export const actionToCommand: Record<string, string> = {
  list_files: '/google/drive/list',
  get_file: '/google/drive/read',
  download_file: '/google/drive/download',
  create_file: '/google/drive/write',
  delete_file: '/google/drive/delete',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const fileId = typeof params.file_id === 'string' ? params.file_id : undefined;

  switch (actionId) {
    case 'list_files':
    case 'create_file':
      return {};
    default:
      return fileId ? { file_id: fileId } : {};
  }
}
