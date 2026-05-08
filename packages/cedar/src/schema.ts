import { cedarBinding } from './binding.js';
import type { Schema, SchemaValidationResult } from './types.js';

export function validateSchema(schema: Schema): SchemaValidationResult {
  const result = cedarBinding.checkParseSchema(schema);
  if (result.type === 'success') return { ok: true, errors: [] };
  return { ok: false, errors: result.errors.map((e) => e.message) };
}
