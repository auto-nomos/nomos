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
  update_file: '/google/drive/update',
  copy_file: '/google/drive/copy',
  create_folder: '/google/drive/folder/create',
  search_files: '/google/drive/search',
  share_file: '/google/drive/share',
  export_file: '/google/drive/export',
  list_permissions: '/google/drive/permission/list',
  delete_permission: '/google/drive/permission/delete',
  list_revisions: '/google/drive/revision/list',
  get_storage_quota: '/google/drive/quota/read',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const fileId =
    typeof params.fileId === 'string'
      ? params.fileId
      : typeof params.file_id === 'string'
        ? params.file_id
        : undefined;

  const permissionId =
    typeof params.permissionId === 'string' ? params.permissionId : undefined;

  switch (actionId) {
    case 'list_files':
    case 'create_file':
    case 'create_folder':
    case 'search_files':
    case 'get_storage_quota':
      return {};
    case 'delete_permission':
      return {
        ...(fileId ? { file_id: fileId } : {}),
        ...(permissionId ? { permission_id: permissionId } : {}),
      };
    default:
      return fileId ? { file_id: fileId } : {};
  }
}
