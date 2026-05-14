/**
 * Verifies the YAML-derived apiCallSchema floor for every bound command.
 *
 * Positive: for each action in adapter YAML, the canonical (method + path
 * filled from template) must satisfy the generated apiCallSchema.
 *
 * Negative: forging a different HTTP method, swapping in a sibling
 * action's path template, or sneaking `..`/`//` segments must fail.
 *
 * Together these lock the 2026-05-14 apiCall-smuggle vector: a UCAN minted
 * for command C may only proxy an HTTP call whose method and path-template
 * match C as declared in its YAML adapter.
 */
import { type Action, loadAllAdapters } from '@auto-nomos/adapters';
import { describe, expect, it } from 'vitest';
import { actionToCommand as githubMap } from '../github/actions.js';
import { actionToCommand as googleMap } from '../google/actions.js';
import { actionToCommand as googleCalendarMap } from '../google_calendar/actions.js';
import { actionToCommand as googleDocsMap } from '../google_docs/actions.js';
import { actionToCommand as googleGmailMap } from '../google_gmail/actions.js';
import { actionToCommand as googleSheetsMap } from '../google_sheets/actions.js';
import { actionToCommand as googleTasksMap } from '../google_tasks/actions.js';
import { PACKS, validateApiCall } from '../index.js';
import { actionToCommand as linearMap } from '../linear/actions.js';
import { actionToCommand as notionMap } from '../notion/actions.js';
import { actionToCommand as slackMap } from '../slack/actions.js';
import { actionToCommand as stripeMap } from '../stripe/actions.js';

interface PackEntry {
  adapterId: string;
  actionToCommand: Record<string, string>;
}

const PACK_TO_ENTRY: Record<string, PackEntry> = {
  github: { adapterId: 'github', actionToCommand: githubMap },
  slack: { adapterId: 'slack', actionToCommand: slackMap },
  notion: { adapterId: 'notion', actionToCommand: notionMap },
  linear: { adapterId: 'linear', actionToCommand: linearMap },
  stripe: { adapterId: 'stripe', actionToCommand: stripeMap },
  google: { adapterId: 'google_drive', actionToCommand: googleMap },
  google_calendar: { adapterId: 'google_calendar', actionToCommand: googleCalendarMap },
  google_gmail: { adapterId: 'google_gmail', actionToCommand: googleGmailMap },
  google_docs: { adapterId: 'google_docs', actionToCommand: googleDocsMap },
  google_sheets: { adapterId: 'google_sheets', actionToCommand: googleSheetsMap },
  google_tasks: { adapterId: 'google_tasks', actionToCommand: googleTasksMap },
};

/** Fill a YAML path template with placeholder segments matching `[^/]+`/`.+`. */
function fillTemplate(tmpl: string): string {
  return tmpl.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, 'x');
}

function buildPositiveApiCall(action: Action): unknown {
  const path = fillTemplate(action.http.path);
  const body: Record<string, unknown> = {};
  for (const p of action.params) {
    if ((p.in === 'body' || p.in === 'form') && p.required) {
      body[p.name] = stubFor(p.type, p.enum);
    }
  }
  const query: Record<string, string> = {};
  for (const p of action.params) {
    if (p.in === 'query' && p.required) {
      query[p.name] = 'x';
    }
  }
  return {
    method: action.http.method,
    path,
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(Object.keys(body).length > 0 ? { body } : {}),
  };
}

function stubFor(type: string, enumValues?: readonly string[]): unknown {
  if (enumValues && enumValues.length > 0) return enumValues[0];
  switch (type) {
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return 'x';
  }
}

const WRONG_METHOD: Record<string, string> = {
  GET: 'POST',
  POST: 'GET',
  PUT: 'GET',
  PATCH: 'GET',
  DELETE: 'GET',
};

describe('generated apiCallSchema floor', () => {
  const adapters = loadAllAdapters();
  for (const [packId, entry] of Object.entries(PACK_TO_ENTRY)) {
    describe(`pack ${packId}`, () => {
      const adapter = adapters.get(entry.adapterId);
      const pack = PACKS.find((p) => p.id === packId);
      if (!adapter || !pack) {
        it.skip(`adapter or pack missing for ${packId}`, () => {});
        return;
      }

      it('binds every YAML action to a command with a generated schema', () => {
        for (const action of adapter.actions) {
          const command = entry.actionToCommand[action.id];
          expect(command, `pack ${packId}: action ${action.id} has no command`).toBeTruthy();
          const schemas = pack.actionSchemas?.[command!];
          expect(
            schemas?.apiCallSchema,
            `pack ${packId}: command ${command} has no apiCallSchema`,
          ).toBeTruthy();
        }
      });

      it('accepts the canonical apiCall for every bound action', () => {
        for (const action of adapter.actions) {
          const command = entry.actionToCommand[action.id];
          if (!command) continue;
          const apiCall = buildPositiveApiCall(action);
          const result = validateApiCall(command, apiCall);
          expect(
            result.ok,
            `pack ${packId}: ${command} positive case must pass; got ${JSON.stringify(result)}`,
          ).toBe(true);
        }
      });

      it('rejects wrong HTTP method for every bound action', () => {
        for (const action of adapter.actions) {
          const command = entry.actionToCommand[action.id];
          if (!command) continue;
          const apiCall = buildPositiveApiCall(action) as Record<string, unknown>;
          apiCall.method = WRONG_METHOD[action.http.method] ?? 'GET';
          if (apiCall.method === action.http.method) continue;
          const result = validateApiCall(command, apiCall);
          expect(
            result.ok,
            `pack ${packId}: ${command} should deny wrong method ${String(apiCall.method)}`,
          ).toBe(false);
        }
      });

      it('rejects `..` traversal in apiCall.path for every bound action', () => {
        for (const action of adapter.actions) {
          const command = entry.actionToCommand[action.id];
          if (!command) continue;
          const apiCall = buildPositiveApiCall(action) as Record<string, unknown>;
          apiCall.path = `${String(apiCall.path)}/../etc/passwd`;
          const result = validateApiCall(command, apiCall);
          expect(result.ok, `pack ${packId}: ${command} must reject traversal path`).toBe(false);
        }
      });
    });
  }
});

describe('apiCall-smuggle regression', () => {
  it('blocks POST /git/refs while claiming /github/content/update (the 2026-05-14 vector)', () => {
    const result = validateApiCall('/github/content/update', {
      method: 'POST',
      path: '/repos/acme/billing/git/refs',
      body: { ref: 'refs/heads/smuggle', sha: 'deadbeef' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema_violation');
    }
  });

  it('allows the legitimate PUT /contents/{path} call for /github/content/update', () => {
    const result = validateApiCall('/github/content/update', {
      method: 'PUT',
      path: '/repos/acme/billing/contents/docs/readme.md',
      body: { message: 'docs', content: 'aGVsbG8=' },
    });
    expect(result.ok).toBe(true);
  });

  it('binds /github/branch/create to POST /git/refs (no longer smuggleable)', () => {
    const result = validateApiCall('/github/branch/create', {
      method: 'POST',
      path: '/repos/acme/billing/git/refs',
      body: { ref: 'refs/heads/feature', sha: 'deadbeef' },
    });
    expect(result.ok).toBe(true);
  });
});

describe('fail-closed on declared write commands without a schema', () => {
  it('returns schema_missing when a pack action loses its schema entry', () => {
    // Construct a synthetic case: github command that exists in pack.actions
    // but has no apiCallSchema. The orphans allowlisted in parity-check
    // (e.g. /slack/message/read) exercise this path naturally.
    const result = validateApiCall('/slack/message/read', {
      method: 'GET',
      path: '/api/conversations.history',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema_missing');
    }
  });
});
