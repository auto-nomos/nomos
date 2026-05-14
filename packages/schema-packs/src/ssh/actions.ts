export const actionToCommand: Record<string, string> = {
  read_file: '/ssh/file/read',
  write_file: '/ssh/file/write',
  create_file: '/ssh/file/create',
  delete_file: '/ssh/file/delete',
  move_file: '/ssh/file/move',
  copy_file: '/ssh/file/copy',
  list_dir: '/ssh/dir/list',
  tree_dir: '/ssh/dir/tree',
  create_dir: '/ssh/dir/create',
  delete_dir: '/ssh/dir/delete',
  delete_dir_recursive: '/ssh/dir/delete_recursive',
  exec: '/ssh/exec',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const host = typeof params.host === 'string' ? params.host : undefined;
  const filePath = typeof params.path === 'string' ? params.path : undefined;
  const destination = typeof params.destination === 'string' ? params.destination : undefined;

  const base: Record<string, unknown> = {};
  if (host) base.host = host;
  if (filePath) {
    base.path = filePath;
    base.type = actionId.includes('dir') ? 'directory' : 'file';
  }
  if (destination) base.destination = destination;
  return base;
}
