export { awsPack } from './aws/index.js';
export { azurePack } from './azure/index.js';
export { filesystemPack } from './filesystem/index.js';
export { gcpPack } from './gcp/index.js';
export { githubPack } from './github/index.js';
export { googlePack } from './google/index.js';
export { googleCalendarPack } from './google_calendar/index.js';
export { googleDocsPack } from './google_docs/index.js';
export { googleGmailPack } from './google_gmail/index.js';
export { googleSheetsPack } from './google_sheets/index.js';
export { googleTasksPack } from './google_tasks/index.js';
export { linearPack } from './linear/index.js';
export { notionPack } from './notion/index.js';
export { slackPack } from './slack/index.js';
export { stripePack } from './stripe/index.js';
export * from './types.js';

import { awsPack } from './aws/index.js';
import { azurePack } from './azure/index.js';
import { filesystemPack } from './filesystem/index.js';
import { gcpPack } from './gcp/index.js';
import { githubPack } from './github/index.js';
import { googlePack } from './google/index.js';
import { googleCalendarPack } from './google_calendar/index.js';
import { googleDocsPack } from './google_docs/index.js';
import { googleGmailPack } from './google_gmail/index.js';
import { googleSheetsPack } from './google_sheets/index.js';
import { googleTasksPack } from './google_tasks/index.js';
import { linearPack } from './linear/index.js';
import { notionPack } from './notion/index.js';
import { slackPack } from './slack/index.js';
import { stripePack } from './stripe/index.js';
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
  notionPack,
  linearPack,
  stripePack,
  filesystemPack,
  azurePack,
  awsPack,
  gcpPack,
];

export function listTemplates(): PolicyTemplate[] {
  return PACKS.flatMap((p) => p.templates);
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

/** Find the pack that owns a command, if any. Returns undefined for
 *  pass-through integrations (first segment not in KNOWN_INTEGRATIONS). */
function packForCommand(command: string): IntegrationPack | undefined {
  const seg = command.split('/')[1];
  if (!seg) return undefined;
  return PACKS.find((p) => p.id === seg);
}

export type ValidateResult = { ok: true } | { ok: false; reason: string; issues?: unknown };

/**
 * D3 (Lane B): Validate a proxy /v1/proxy `apiCall` against the schema-pack
 * for its command. Returns `{ ok: true }` when:
 *   - the pack defines no schema for the command (pass-through), OR
 *   - the pack declares a schema and the apiCall conforms.
 * Returns `{ ok: false, reason: 'schema_violation', issues }` otherwise.
 *
 * Callers should fail-closed on `ok: false` with deny + receipt.
 */
export function validateApiCall(command: string, apiCall: unknown): ValidateResult {
  const pack = packForCommand(command);
  if (!pack) return { ok: true }; // unknown integration → Cedar pass-through
  const schema = pack.actionSchemas?.[command]?.apiCallSchema;
  if (!schema) return { ok: true }; // pack hasn't declared per-action shape yet
  const parsed = schema.safeParse(apiCall);
  if (parsed.success) return { ok: true };
  return { ok: false, reason: 'schema_violation', issues: parsed.error.issues };
}

/**
 * D3 (Lane B): Validate a Cedar `request.resource` object against the
 * schema-pack for its command. Same pass-through semantics as
 * validateApiCall.
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
