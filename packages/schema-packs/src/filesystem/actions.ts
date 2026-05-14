/** Browser-safe extname: returns "ts" for "foo.ts", "" for "foo". */
function extname(p: string): string {
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const dot = p.lastIndexOf('.');
  return dot > slash && dot < p.length - 1 ? p.slice(dot + 1) : '';
}

export const actionToCommand: Record<string, string> = {
  read_file: '/filesystem/file/read',
  write_file: '/filesystem/file/write',
  create_file: '/filesystem/file/create',
  delete_file: '/filesystem/file/delete',
  move_file: '/filesystem/file/move',
  copy_file: '/filesystem/file/copy',
  list_dir: '/filesystem/dir/list',
  tree_dir: '/filesystem/dir/tree',
  create_dir: '/filesystem/dir/create',
  delete_dir: '/filesystem/dir/delete',
  delete_dir_recursive: '/filesystem/dir/delete_recursive',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const filePath = typeof params.path === 'string' ? params.path : undefined;
  const destination = typeof params.destination === 'string' ? params.destination : undefined;
  const ext = filePath ? extname(filePath) : '';

  const base: Record<string, unknown> = {};
  if (filePath) base.path = filePath;
  if (ext) base.extension = ext;
  if (filePath) base.type = actionId.includes('dir') ? 'directory' : 'file';

  switch (actionId) {
    case 'move_file':
    case 'copy_file':
      if (destination) base.destination = destination;
      return base;
    default:
      return base;
  }
}
