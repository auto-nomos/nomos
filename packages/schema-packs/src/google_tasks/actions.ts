/**
 * Mapping from `packages/adapters/spec/google_tasks.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/tasks/...`.
 */

export const actionToCommand: Record<string, string> = {
  list_tasklists: '/google/tasks/tasklist/list',
  list_tasks: '/google/tasks/task/list',
  get_task: '/google/tasks/task/read',
  create_task: '/google/tasks/task/create',
  update_task: '/google/tasks/task/update',
  delete_task: '/google/tasks/task/delete',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const tasklist = typeof params.tasklist === 'string' ? params.tasklist : undefined;
  const task = typeof params.task === 'string' ? params.task : undefined;

  switch (actionId) {
    case 'list_tasklists':
      return {};
    case 'list_tasks':
    case 'create_task':
      return tasklist ? { tasklist } : {};
    case 'get_task':
    case 'update_task':
    case 'delete_task':
      return {
        ...(tasklist ? { tasklist } : {}),
        ...(task ? { task } : {}),
      };
    default:
      return {};
  }
}
