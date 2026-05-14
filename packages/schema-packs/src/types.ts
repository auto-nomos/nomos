/**
 * Schema pack public surface.
 *
 * Sprint 7 ships the `templates` half so the dashboard's policy-creation
 * wizard can offer 20 starter policies. Sprint 10 fills in `resources`,
 * `actions`, `defaultPolicies`, and `connector` so the PDP can validate
 * authorize requests against per-integration vocab.
 */
import type { z } from 'zod';

export type IntegrationId =
  | 'github'
  | 'slack'
  | 'google'
  | 'notion'
  | 'filesystem'
  | 'linear'
  | 'stripe'
  | 'google_calendar'
  | 'google_gmail'
  | 'google_docs'
  | 'google_sheets'
  | 'google_tasks'
  | 'google_contacts'
  | 'swarm'
  // M1+ — cloud IAM. One pack per cloud; per-service surfaces (compute,
  // storage, observability) live as namespaced action prefixes inside
  // each pack (e.g. /azure/vm/list, /azure/storage/blob_read).
  | 'azure'
  | 'aws'
  | 'gcp';

export interface PolicyTemplate {
  /** Stable id, namespaced on integration: `github:read-only`. */
  id: string;
  integrationId: IntegrationId;
  /** User-visible name. */
  name: string;
  /** One-sentence description shown next to the name in the picker. */
  description: string;
  /** Valid Cedar text — must parse via @auto-nomos/cedar.parsePolicy. */
  cedarText: string;
  /**
   * `true` when the visual builder can render the template losslessly.
   * `false` means the template uses shapes outside the IR — the visual
   * tab will show an "edit in Cedar" banner.
   */
  visualReady: boolean;
}

/**
 * D3 (Lane B): per-action input shape used by the PDP to enforce
 * schema-pack validation BEFORE Cedar evaluation. The PDP runs
 * `apiCallSchema` against the `/v1/proxy` body and `resourceSchema` against
 * `request.resource` on both `/v1/authorize` and `/v1/proxy`. Schemas are
 * optional per-action so packs that haven't been filled in yet keep their
 * existing pass-through behavior — only declared (command, schema) pairs
 * enforce.
 */
export interface ActionSchemas {
  /** Zod schema for the proxy `apiCall` payload (method, path, body, query). */
  apiCallSchema?: z.ZodTypeAny;
  /** Zod schema for the Cedar `request.resource` object. */
  resourceSchema?: z.ZodTypeAny;
}

export interface IntegrationPack {
  id: IntegrationId;
  name: string;
  templates: PolicyTemplate[];
  /**
   * Canonical command list for this integration. Same vocabulary the SDK
   * uses to call the PDP — sourcing UI dropdowns from here keeps policy
   * authors and SDK callers in sync.
   */
  actions: string[];
  /**
   * Map keyed by full command (e.g. `/github/issue/create`) carrying the
   * schemas the PDP enforces before decide() runs. Undefined or partial
   * coverage is OK — the PDP treats missing entries as pass-through.
   */
  actionSchemas?: Partial<Record<string, ActionSchemas>>;
  /**
   * 2026-05-14 resource_mismatch fix — derive the effective resource
   * (owner, repo, channel, page_id, …) from `apiCall.{method,path}`. The
   * PDP's `validateResourceConsistency` compares each key returned here
   * against the agent-declared `request.resource`; mismatch is a deny.
   * Return null when the call has no path-bound resource (e.g. github
   * `GET /user`, `GET /search/...`).
   *
   * Packs without this function are pass-through — declared resource is
   * still validated by `resourceSchema` shape and by Cedar. Implementing
   * this hardens the pack against agents lying about which resource they
   * target while pointing apiCall at a different one.
   */
  extractResourceFromApiCall?: (
    command: string,
    apiCall: { method: string; path: string; body?: unknown },
  ) => Record<string, unknown> | null;
}

/**
 * Shallow-merge two action-schema maps per command. Used to layer
 * hand-curated schemas (in `<pack>/schemas.ts`) over the YAML-generated
 * floor in `__generated__/<pack>-api-schemas.ts`. Hand-curated tightens
 * generated — when both define `apiCallSchema` for the same command, the
 * hand-curated one wins; `resourceSchema` is overlaid the same way.
 */
export function mergeActionSchemas(
  base: Partial<Record<string, ActionSchemas>>,
  override: Partial<Record<string, ActionSchemas>>,
): Partial<Record<string, ActionSchemas>> {
  const out: Partial<Record<string, ActionSchemas>> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(override)]);
  for (const k of keys) {
    out[k] = { ...base[k], ...override[k] };
  }
  return out;
}
