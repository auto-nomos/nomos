import type {
  Context,
  Decision,
  DetailedError,
  Entities,
  EntityUid,
  Schema,
} from '@cedar-policy/cedar-wasm/nodejs';

export type { Context, Decision, DetailedError, Entities, EntityUid, Schema };

export interface ParseResult {
  ok: boolean;
  errors: DetailedError[];
}

export interface EvaluateInput {
  policies: string;
  principal: EntityUid;
  action: EntityUid;
  resource: EntityUid;
  context: Context;
  entities?: Entities;
  schema?: Schema;
}

export interface EvaluateResult {
  decision: Decision;
  reason: string[];
  errors: string[];
  warnings: string[];
}

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

export interface LintWarning {
  type: 'parse' | 'format';
  message: string;
}

export interface LintResult {
  ok: boolean;
  warnings: LintWarning[];
}
