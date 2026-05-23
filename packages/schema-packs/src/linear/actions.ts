/**
 * Mapping from `packages/adapters/spec/linear.yaml` action ids to canonical
 * Cedar commands. Linear is GraphQL-only, so `resource` extraction reaches
 * into `params.variables` rather than top-level path/query params.
 */

export const actionToCommand: Record<string, string> = {
  list_issues: '/linear/issue/list',
  get_issue: '/linear/issue/read',
  create_issue: '/linear/issue/create',
  update_issue: '/linear/issue/update',
  comment_on_issue: '/linear/issue/comment',
  list_projects: '/linear/project/list',
  list_teams: '/linear/team/list',
  get_viewer: '/linear/user/me',
  delete_issue: '/linear/issue/delete',
  search_issues: '/linear/issue/search',
  list_workflow_states: '/linear/workflow_state/list',
  list_labels: '/linear/label/list',
  list_members: '/linear/user/list',
  get_project: '/linear/project/read',
  create_project: '/linear/project/create',
  update_project: '/linear/project/update',
  list_comments: '/linear/comment/list',
  assign_issue: '/linear/issue/assign',
  archive_project: '/linear/project/archive',
  list_cycles: '/linear/cycle/list',
  get_team: '/linear/team/read',
  create_comment: '/linear/comment/create',
  move_issue: '/linear/issue/move',
  close_issue: '/linear/issue/close',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const variables =
    params.variables && typeof params.variables === 'object'
      ? (params.variables as Record<string, unknown>)
      : {};
  const id = typeof variables.id === 'string' ? variables.id : undefined;
  const teamId =
    typeof (variables.input as Record<string, unknown> | undefined)?.teamId === 'string'
      ? ((variables.input as Record<string, unknown>).teamId as string)
      : undefined;

  switch (actionId) {
    case 'get_issue':
    case 'update_issue':
      return id ? { issue: id } : {};
    case 'create_issue':
      return teamId ? { team: teamId } : {};
    case 'assign_issue':
    case 'move_issue':
    case 'close_issue':
      return id ? { issue: id } : {};
    case 'archive_project':
      return id ? { project: id } : {};
    case 'get_team':
      return id ? { team: id } : {};
    default:
      return {};
  }
}
