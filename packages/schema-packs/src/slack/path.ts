/**
 * Parse the slack API path (e.g. `/conversations.history`, `/chat.postMessage`)
 * plus optional query params and body to identify the channel/user/thread the
 * call targets. Slack identifies resources mostly in `body.channel` /
 * `query.channel` / `body.user` rather than the URL — so this parser inspects
 * all three sources.
 *
 * Returns null when the path doesn't start with a slack-style `/<method>`
 * segment (single segment, method-name dot-separated). Caller treats null
 * as "unparseable" and the PDP refuses when a slack constraint is present.
 */
export function parseSlackPath(
  path: string,
  query?: Record<string, string>,
  body?: unknown,
): {
  method?: string;
  channel_id?: string;
  user_id?: string;
  thread_ts?: string;
  ts?: string;
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length !== 1) return null;
  const slackMethod = segs[0]!;
  if (!/^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)+$/.test(slackMethod)) return null;
  const out: ReturnType<typeof parseSlackPath> = { method: slackMethod };
  const b =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const channel =
    (typeof b.channel === 'string' && b.channel) ||
    (query && typeof query.channel === 'string' && query.channel) ||
    undefined;
  if (channel) out!.channel_id = channel;
  const user =
    (typeof b.user === 'string' && b.user) ||
    (query && typeof query.user === 'string' && query.user) ||
    undefined;
  if (user) out!.user_id = user;
  const threadTs =
    (typeof b.thread_ts === 'string' && b.thread_ts) ||
    (query && typeof query.thread_ts === 'string' && query.thread_ts) ||
    undefined;
  if (threadTs) out!.thread_ts = threadTs;
  const ts =
    (typeof b.ts === 'string' && b.ts) ||
    (query && typeof query.ts === 'string' && query.ts) ||
    undefined;
  if (ts) out!.ts = ts;
  return out;
}
