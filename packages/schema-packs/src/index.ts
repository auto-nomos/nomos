export { awsPack } from './aws/index.js';
export { azurePack } from './azure/index.js';
export { discordPack } from './discord/index.js';
export { filesystemPack } from './filesystem/index.js';
export { gcpPack } from './gcp/index.js';
export { githubPack } from './github/index.js';
export { googlePack } from './google/index.js';
export { googleCalendarPack } from './google_calendar/index.js';
export { googleContactsPack } from './google_contacts/index.js';
export { googleDocsPack } from './google_docs/index.js';
export { googleGmailPack } from './google_gmail/index.js';
export { googleSheetsPack } from './google_sheets/index.js';
export { googleTasksPack } from './google_tasks/index.js';
export { linearPack } from './linear/index.js';
export { notionPack } from './notion/index.js';
export { slackPack } from './slack/index.js';
export { sshPack } from './ssh/index.js';
export { stripePack } from './stripe/index.js';
export { SWARM_SAFE_TEMPLATES, swarmSafePack } from './swarm-safe/index.js';
export * from './types.js';

import { awsPack } from './aws/index.js';
import { azurePack } from './azure/index.js';
import { discordPack } from './discord/index.js';
import { filesystemPack } from './filesystem/index.js';
import { gcpPack } from './gcp/index.js';
import { githubPack } from './github/index.js';
import { googlePack } from './google/index.js';
import { googleCalendarPack } from './google_calendar/index.js';
import { googleContactsPack } from './google_contacts/index.js';
import { googleDocsPack } from './google_docs/index.js';
import { googleGmailPack } from './google_gmail/index.js';
import { googleSheetsPack } from './google_sheets/index.js';
import { googleTasksPack } from './google_tasks/index.js';
import { linearPack } from './linear/index.js';
import { notionPack } from './notion/index.js';
import { slackPack } from './slack/index.js';
import { sshPack } from './ssh/index.js';
import { stripePack } from './stripe/index.js';
import { SWARM_SAFE_TEMPLATES } from './swarm-safe/index.js';
import type { IntegrationId, IntegrationPack, PolicyTemplate } from './types.js';

export const PACKS: IntegrationPack[] = [
  githubPack,
  slackPack,
  googlePack,
  googleCalendarPack,
  googleGmailPack,
  googleDocsPack,
  googleSheetsPack,
  googleTasksPack,
  googleContactsPack,
  notionPack,
  linearPack,
  stripePack,
  discordPack,
  filesystemPack,
  sshPack,
  azurePack,
  awsPack,
  gcpPack,
];

export function listTemplates(): PolicyTemplate[] {
  // Sprint MAOS-B — swarm-safe templates surface alongside per-integration
  // templates so the dashboard wizard can offer them on any integration.
  return [...PACKS.flatMap((p) => p.templates), ...SWARM_SAFE_TEMPLATES];
}

export function templatesFor(integrationId: IntegrationId): PolicyTemplate[] {
  return PACKS.find((p) => p.id === integrationId)?.templates ?? [];
}

export function templateById(id: string): PolicyTemplate | undefined {
  return listTemplates().find((t) => t.id === id);
}

export function actionsFor(integrationId: IntegrationId): string[] {
  return PACKS.find((p) => p.id === integrationId)?.actions ?? [];
}

export const KNOWN_COMMANDS: ReadonlySet<string> = new Set(
  PACKS.flatMap((pack) => actionsFor(pack.id)),
);
export const KNOWN_INTEGRATIONS: ReadonlySet<string> = new Set(PACKS.map((p) => p.id));

/**
 * Command admission check used at the PDP edge. Returns true when:
 *   - the exact command is declared by a pack's `actions` (KNOWN_COMMANDS), or
 *   - the integration namespace (first path segment) is NOT one schema-packs
 *     declares — preserves the existing pass-through for arbitrary Cedar action
 *     namespaces in tests and bespoke deployments.
 */
export function isKnownCommand(command: string): boolean {
  if (KNOWN_COMMANDS.has(command)) return true;
  const seg = command.split('/')[1];
  if (!seg) return false;
  return !KNOWN_INTEGRATIONS.has(seg);
}

/** Find the pack that owns a command, if any. Uses longest-prefix match
 *  so multi-word pack ids resolve correctly: `/google/calendar/event/create`
 *  routes to `google_calendar` rather than `google` (Drive). Falls back to
 *  the first segment for single-word packs (github, slack, notion, …). */
function packForCommand(command: string): IntegrationPack | undefined {
  const segs = command.split('/').filter(Boolean);
  if (segs.length === 0) return undefined;
  for (let n = Math.min(segs.length, 4); n >= 1; n--) {
    const candidateId = segs.slice(0, n).join('_');
    const pack = PACKS.find((p) => p.id === candidateId);
    if (pack) return pack;
  }
  return undefined;
}

export type ValidateResult = { ok: true } | { ok: false; reason: string; issues?: unknown };

/**
 * D3 (Lane B): Validate a proxy /v1/proxy `apiCall` against the schema-pack
 * for its command. Behaviour:
 *   - Unknown integration namespace → pass (Cedar handles authorization).
 *   - Known pack + command listed in `pack.actions` + missing schema →
 *     deny with `schema_missing`. Closes the 2026-05-14 smuggle class:
 *     before this fix, an in-tree write command without an apiCallSchema
 *     would pass through and let the agent point the proxy at any HTTP
 *     endpoint that satisfied the connector's repo-gate.
 *   - Known pack + command NOT in `pack.actions` → pass (lets tests and
 *     bespoke Cedar deployments use ad-hoc commands without forcing every
 *     test to mint a schema).
 *   - Known schema present → enforce it; mismatch is `schema_violation`.
 */
export function validateApiCall(command: string, apiCall: unknown): ValidateResult {
  const pack = packForCommand(command);
  if (!pack) return { ok: true };
  const schema = pack.actionSchemas?.[command]?.apiCallSchema;
  if (!schema) {
    if (pack.actions.includes(command)) {
      return { ok: false, reason: 'schema_missing' };
    }
    return { ok: true };
  }
  const parsed = schema.safeParse(apiCall);
  if (parsed.success) return { ok: true };
  return { ok: false, reason: 'schema_violation', issues: parsed.error.issues };
}

/**
 * D3 (Lane B): Validate a Cedar `request.resource` object against the
 * schema-pack for its command. Resource validation stays pass-through when
 * no schema is declared (the smuggle class is on `apiCall`, not resource —
 * see `validateApiCall`). Hand-curated resourceSchema entries still enforce
 * when present.
 */
export function validateResource(command: string, resource: unknown): ValidateResult {
  const pack = packForCommand(command);
  if (!pack) return { ok: true };
  const schema = pack.actionSchemas?.[command]?.resourceSchema;
  if (!schema) return { ok: true };
  const parsed = schema.safeParse(resource);
  if (parsed.success) return { ok: true };
  return { ok: false, reason: 'schema_violation', issues: parsed.error.issues };
}

/**
 * 2026-05-14 resource_mismatch fix — cross-check the agent-declared
 * `request.resource` against the resource derived from the actual
 * `apiCall.{method,path}`. Closes Probe-14: a UCAN minted broadly let
 * Cursor declare `resource = octocat/Hello-World` while
 * `apiCall.path = /repos/admin/test-repo/...`; the file landed on
 * test-repo, audit logged octocat.
 *
 * Semantics: every key the pack's extractor returns is compared against
 * the declared resource. If the declared resource sets the key to a
 * different value, deny. Undeclared keys don't force a deny — some
 * commands legitimately have empty resource (e.g. `/github/user/read`).
 * Packs without an extractor pass through (back-compat).
 */
export type ConsistencyResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'resource_mismatch';
      field: string;
      declared: unknown;
      effective: unknown;
    };

const COMPARED_KEYS = [
  // github
  'owner',
  'repo',
  'repo_name',
  'issue_number',
  'pull_number',
  // slack
  'channel',
  'channel_id',
  'user_id',
  'thread_ts',
  // notion
  'page_id',
  'database_id',
  'block_id',
  // google drive
  'file_id',
  'folder_id',
  'drive_id',
  'permission_id',
  // google gmail
  'message_id',
  'thread_id',
  'label_id',
  // google calendar
  'calendar_id',
  'event_id',
  // google docs / sheets / tasks
  'document_id',
  'spreadsheet_id',
  'sheet_id',
  'range',
  'tasklist_id',
  'task_id',
  // google contacts
  'resource_name',
  // stripe
  'customer_id',
  'payment_intent',
  'charge_id',
  'subscription_id',
  'invoice_id',
  // linear
  'team_id',
  'project_id',
  'issue_id',
  // filesystem + ssh
  'path',
  'host',
  // discord
  'guild_id',
  'role_id',
] as const;

export function validateResourceConsistency(
  command: string,
  resource: unknown,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): ConsistencyResult {
  const pack = packForCommand(command);
  if (!pack?.extractResourceFromApiCall) return { ok: true };
  const effective = pack.extractResourceFromApiCall(command, apiCall);
  if (!effective) return { ok: true };
  const declared = (resource ?? {}) as Record<string, unknown>;
  for (const key of COMPARED_KEYS) {
    const eff = effective[key];
    if (eff === undefined) continue;
    const dec = declared[key];
    if (dec === undefined) continue;
    if (dec !== eff) {
      return { ok: false, reason: 'resource_mismatch', field: key, declared: dec, effective: eff };
    }
  }
  return { ok: true };
}
