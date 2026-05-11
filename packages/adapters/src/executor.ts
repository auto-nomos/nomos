import { applySanitize } from './sanitize.js';
import type { Action, AdapterSpec, Param } from './schema.js';
import { evalExpression, type TransformContext } from './transforms.js';

/**
 * Adapter executor — given an adapter spec, an action id, raw param values,
 * and a connector that knows how to authenticate + call the upstream API,
 * resolve defaults/transforms, build the HTTP request, dispatch via the
 * connector, then apply response sanitization. The connector itself is the
 * existing `Connector.callApi` from apps/control-plane/src/oauth/connector.ts.
 */

export interface AdapterCallApiRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface AdapterCallApiResponse {
  status: number;
  body: unknown;
}

export interface AdapterConnector {
  callApi(req: AdapterCallApiRequest): Promise<AdapterCallApiResponse>;
}

export class AdapterError extends Error {
  override name = 'AdapterError';
  constructor(
    message: string,
    public readonly code:
      | 'action_not_found'
      | 'param_missing'
      | 'param_invalid'
      | 'transform_failed'
      | 'http_failed',
  ) {
    super(message);
  }
}

export interface ExecuteRequest {
  adapter: AdapterSpec;
  actionId: string;
  params: Record<string, unknown>;
  connector: AdapterConnector;
}

export interface ExecuteResult {
  status: number;
  body: unknown;
  raw: unknown;
}

function findAction(adapter: AdapterSpec, actionId: string): Action {
  const a = adapter.actions.find((x) => x.id === actionId);
  if (!a) {
    throw new AdapterError(`adapter ${adapter.id} has no action ${actionId}`, 'action_not_found');
  }
  return a;
}

function resolveValue(p: Param, raw: Record<string, unknown>): unknown {
  let v = raw[p.name];
  if (v === undefined || v === null || v === '') {
    if (p.default !== undefined) v = p.default;
    else if (p.default_expr) {
      try {
        v = evalExpression(p.default_expr, { params: raw });
      } catch (err) {
        throw new AdapterError(
          `default_expr for ${p.name}: ${(err as Error).message}`,
          'transform_failed',
        );
      }
    }
  }
  if (v !== undefined && v !== null && p.transform) {
    try {
      v = evalExpression(p.transform, { params: raw, value: v });
    } catch (err) {
      throw new AdapterError(
        `transform for ${p.name}: ${(err as Error).message}`,
        'transform_failed',
      );
    }
  }
  return v;
}

function validateParams(action: Action, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of action.params) {
    const v = resolveValue(p, raw);
    if (v === undefined || v === null) {
      if (p.required) {
        throw new AdapterError(`required param missing: ${p.name}`, 'param_missing');
      }
      continue;
    }
    if (p.enum && !p.enum.includes(String(v))) {
      throw new AdapterError(`param ${p.name} not in enum [${p.enum.join('|')}]`, 'param_invalid');
    }
    out[p.name] = v;
  }
  return out;
}

interface BuiltRequest {
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}

function buildRequest(action: Action, params: Record<string, unknown>): BuiltRequest {
  let path = action.http.path;
  const query: Record<string, string> = {};
  const body: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  let bodyTouched = false;

  for (const p of action.params) {
    const v = params[p.name];
    if (v === undefined) continue;
    switch (p.in) {
      case 'path':
        path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
        break;
      case 'query':
        query[p.name] = String(v);
        break;
      case 'header':
        headers[p.name] = String(v);
        break;
      case 'body':
      case 'form':
        body[p.name] = v;
        bodyTouched = true;
        break;
    }
  }

  return {
    path,
    query,
    body: bodyTouched ? body : undefined,
    headers,
  };
}

export async function executeAction(req: ExecuteRequest): Promise<ExecuteResult> {
  const action = findAction(req.adapter, req.actionId);
  const resolved = validateParams(action, req.params);
  const built = buildRequest(action, resolved);

  let result: AdapterCallApiResponse;
  try {
    result = await req.connector.callApi({
      method: action.http.method,
      path: built.path,
      query: Object.keys(built.query).length > 0 ? built.query : undefined,
      body: built.body,
      headers: Object.keys(built.headers).length > 0 ? built.headers : undefined,
    });
  } catch (err) {
    throw new AdapterError(`http call failed: ${(err as Error).message}`, 'http_failed');
  }

  const sanitized = applySanitize(result.body, action.response.sanitize);
  return { status: result.status, body: sanitized, raw: result.body };
}

export type { TransformContext };
