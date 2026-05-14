/**
 * Mapping from `packages/adapters/spec/google_gmail.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/gmail/...` for
 * symmetry with `/google/calendar/...` and `/google/drive/...`.
 */

export const actionToCommand: Record<string, string> = {
  list_messages: '/google/gmail/message/list',
  get_message: '/google/gmail/message/read',
  send_message: '/google/gmail/message/send',
  list_threads: '/google/gmail/thread/list',
  trash_message: '/google/gmail/message/trash',
  get_thread: '/google/gmail/thread/read',
  modify_message: '/google/gmail/message/modify',
  list_labels: '/google/gmail/label/list',
  create_draft: '/google/gmail/draft/create',
  get_profile: '/google/gmail/profile/read',
  list_drafts: '/google/gmail/draft/list',
  send_draft: '/google/gmail/draft/send',
  delete_draft: '/google/gmail/draft/delete',
  get_draft: '/google/gmail/draft/read',
  create_label: '/google/gmail/label/create',
  delete_label: '/google/gmail/label/delete',
  untrash_message: '/google/gmail/message/untrash',
  get_label: '/google/gmail/label/read',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const id = typeof params.id === 'string' ? params.id : undefined;

  switch (actionId) {
    case 'list_messages':
    case 'list_threads':
    case 'list_labels':
    case 'send_message':
    case 'create_draft':
    case 'get_profile':
    case 'list_drafts':
    case 'create_label':
      return {};
    case 'get_message':
    case 'trash_message':
    case 'modify_message':
    case 'untrash_message':
      return id ? { message: id } : {};
    case 'get_thread':
      return id ? { thread: id } : {};
    case 'send_draft':
    case 'get_draft':
    case 'delete_draft':
      return id ? { draft: id } : {};
    case 'get_label':
    case 'delete_label':
      return id ? { label: id } : {};
    default:
      return {};
  }
}
