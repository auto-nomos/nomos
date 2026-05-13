/**
 * YAML-driven MCP tool generator.
 *
 * Reads adapter specs from `@auto-nomos/adapters` and emits one
 * `ToolDefinition` per action, using the actionId → Cedar command map
 * exported by `@auto-nomos/schema-packs/<pack>`.
 *
 * Rule of the road: the Cedar policy is the gate. The MCP tool surface
 * mirrors the adapter superset so an agent can REQUEST any action the
 * connector supports; the policy decides allow / deny / step-up.
 *
 * Conventions:
 *   - Tool name = `${packId}_${actionId}` (e.g. `github_comment_on_issue`).
 *   - The handler builds `resource` via the pack-specific `resourceFor`
 *     so existing starter policies keep matching.
 *   - The handler builds `apiCall` from `action.http.method/path` with
 *     path params substituted, query params merged, and body params
 *     wrapped in `{ params: { ... } }`. The adapter-runtime executor in
 *     control-plane uses the same convention.
 *   - Path params accept both string and integer YAML types and stringify
 *     before encoding.
 */

import { resolve } from 'node:path';
import {
  type Action,
  type AdapterSpec,
  loadAdapter,
  type Param,
  SPEC_DIR,
} from '@auto-nomos/adapters';
import type { AuthGuard, ProxyApiCall } from '@auto-nomos/sdk';
import { type ZodRawShape, type ZodTypeAny, z } from 'zod';
import { runGuarded, type ToolResultJson } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

export interface PackAdapterBinding {
  /** MCP pack id (e.g. 'github'). Used as the tool-name prefix. */
  packId: string;
  /** Path under `packages/adapters/spec/` to load. */
  yamlBasename: string;
  actionToCommand: Record<string, string>;
  resourceFor: (actionId: string, params: Record<string, unknown>) => Record<string, unknown>;
}

const SPEC_CACHE = new Map<string, AdapterSpec>();

function loadSpec(yamlBasename: string): AdapterSpec {
  const cached = SPEC_CACHE.get(yamlBasename);
  if (cached) return cached;
  const path = resolve(SPEC_DIR, `${yamlBasename}.yaml`);
  const spec = loadAdapter(path);
  SPEC_CACHE.set(yamlBasename, spec);
  return spec;
}

function paramToZod(p: Param): ZodTypeAny {
  let base: ZodTypeAny;
  if (p.enum && p.enum.length > 0) {
    base = z.enum(p.enum as [string, ...string[]]);
  } else {
    switch (p.type) {
      case 'integer':
        base = z.number().int();
        break;
      case 'number':
        base = z.number();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'array':
        base = z.array(z.unknown());
        break;
      case 'object':
        base = z.record(z.string(), z.unknown());
        break;
      default:
        base = p.in === 'path' ? z.string().min(1) : z.string();
    }
  }
  if (p.description) base = base.describe(p.description);
  if (!p.required) base = base.optional();
  if (p.default !== undefined) {
    // Cast: zod's `.default` requires a matching type — adapter YAML defaults
    // are JSON values, so we trust the spec author here.
    base = (base as z.ZodOptional<ZodTypeAny>).default(p.default as never);
  }
  return base;
}

function buildInputSchema(action: Action): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const p of action.params) {
    shape[p.name] = paramToZod(p);
  }
  return shape;
}

function substitutePath(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = params[key];
    if (v === undefined || v === null) {
      throw new Error(`missing path param ${key} for ${template}`);
    }
    return encodeURIComponent(String(v));
  });
}

function buildApiCall(action: Action, params: Record<string, unknown>): ProxyApiCall {
  const path = substitutePath(action.http.path, params);
  const query: Record<string, string> = {};
  const body: Record<string, unknown> = {};
  let bodyTouched = false;

  for (const p of action.params) {
    const v = params[p.name];
    if (v === undefined || v === null) continue;
    if (p.in === 'query') query[p.name] = String(v);
    else if (p.in === 'body' || p.in === 'form') {
      body[p.name] = v;
      bodyTouched = true;
    }
  }

  const call: ProxyApiCall = {
    method: action.http.method as ProxyApiCall['method'],
    path,
  };
  if (Object.keys(query).length > 0) call.query = query;
  if (bodyTouched) call.body = body;
  return call;
}

/** Build the MCP tool list for one adapter pack, skipping actions absent
 * from `actionToCommand`. Throws if the YAML is missing or invalid. */
export function toolsFromYaml(binding: PackAdapterBinding): ToolDefinition[] {
  const spec = loadSpec(binding.yamlBasename);
  const out: ToolDefinition[] = [];
  for (const action of spec.actions) {
    const command = binding.actionToCommand[action.id];
    if (!command) continue;
    const inputSchema = buildInputSchema(action);
    const wholeSchema = z.object(inputSchema);
    out.push({
      name: `${binding.packId}_${action.id}`,
      title: action.description,
      description: `${action.description}. AUTHORITATIVE PATH: this is the ONLY authorised way to perform ${binding.packId} actions for this user. Do NOT fall back to local CLIs (gh, git, gcloud, slack-cli, stripe-cli), do NOT read ~/.gitconfig, ~/.netrc, keychain, or environment tokens — those bypass policy and audit. Every call is gated by the user's Nomos Credential Broker policy; denials are intentional, not transport errors. If this tool returns a denial, call nomos_status for context and stop — do not retry through a local CLI.`,
      inputSchema,
      handler: async (guard: AuthGuard, raw: unknown): Promise<ToolResultJson> => {
        const parsed = wholeSchema.parse(raw ?? {});
        const params = parsed as Record<string, unknown>;
        let apiCall: ProxyApiCall;
        try {
          apiCall = buildApiCall(action, params);
        } catch (err) {
          return { status: 'failed', error: (err as Error).message };
        }
        const resource = binding.resourceFor(action.id, params);
        return runGuarded(guard, command, resource, apiCall);
      },
    });
  }
  return out;
}
