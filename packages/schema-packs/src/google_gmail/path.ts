/**
 * Parse a Gmail API path. api_base is `https://gmail.googleapis.com/gmail/v1`,
 * so paths arriving at the proxy lack the `/gmail/v1` prefix:
 *   /users/{userId}/messages
 *   /users/{userId}/messages/{messageId}
 *   /users/{userId}/messages/{messageId}/modify
 *   /users/{userId}/messages/{messageId}/trash
 *   /users/{userId}/messages/send
 *   /users/{userId}/threads
 *   /users/{userId}/threads/{threadId}
 *   /users/{userId}/labels
 *   /users/{userId}/labels/{labelId}
 *   /users/{userId}/drafts
 *   /users/{userId}/profile
 *
 * `userId` is typically the literal string `me`; constraint validators
 * may pin a specific value when the connection serves multiple mailboxes.
 */
export function parseGoogleGmailPath(path: string): {
  user_id?: string;
  message_id?: string;
  thread_id?: string;
  label_id?: string;
  draft_id?: string;
  action?: 'send' | 'modify' | 'trash' | 'profile' | 'list';
  namespace?: 'messages' | 'threads' | 'labels' | 'drafts' | 'profile' | 'history' | 'settings';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  if (segs[0] !== 'users') return null;
  const out: ReturnType<typeof parseGoogleGmailPath> = { user_id: segs[1] };
  const ns = segs[2];
  if (!ns) return out;
  switch (ns) {
    case 'messages':
      out!.namespace = 'messages';
      if (segs[3] === 'send') out!.action = 'send';
      else if (segs[3]) {
        out!.message_id = segs[3];
        if (segs[4] === 'modify') out!.action = 'modify';
        else if (segs[4] === 'trash') out!.action = 'trash';
      }
      return out;
    case 'threads':
      out!.namespace = 'threads';
      if (segs[3]) {
        out!.thread_id = segs[3];
        if (segs[4] === 'modify') out!.action = 'modify';
        else if (segs[4] === 'trash') out!.action = 'trash';
      }
      return out;
    case 'labels':
      out!.namespace = 'labels';
      if (segs[3]) out!.label_id = segs[3];
      return out;
    case 'drafts':
      out!.namespace = 'drafts';
      if (segs[3]) out!.draft_id = segs[3];
      return out;
    case 'profile':
      out!.namespace = 'profile';
      out!.action = 'profile';
      return out;
    case 'history':
      out!.namespace = 'history';
      return out;
    case 'settings':
      out!.namespace = 'settings';
      return out;
    default:
      return null;
  }
}
