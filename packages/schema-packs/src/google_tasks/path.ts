/**
 * Google Tasks paths (api_base `https://tasks.googleapis.com/tasks/v1`):
 *   /users/@me/lists
 *   /lists/{tasklist}/tasks
 *   /lists/{tasklist}/tasks/{task}
 */
export function parseGoogleTasksPath(path: string): {
  tasklist_id?: string;
  task_id?: string;
  namespace?: 'lists' | 'users';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] === 'users') {
    if (segs[1] !== '@me' && segs[1] !== 'me') return null;
    return { namespace: 'users' };
  }
  if (segs[0] !== 'lists') return null;
  const out: ReturnType<typeof parseGoogleTasksPath> = { namespace: 'lists' };
  if (segs[1]) out!.tasklist_id = segs[1];
  if (segs[2] === 'tasks' && segs[3]) out!.task_id = segs[3];
  return out;
}
