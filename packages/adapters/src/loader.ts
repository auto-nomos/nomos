import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { type AdapterSpec, AdapterSpecSchema } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SPEC_DIR = resolve(__dirname, '..', 'spec');

export class AdapterParseError extends Error {
  override name = 'AdapterParseError';
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
  }
}

export function parseAdapter(text: string, source = '<inline>'): AdapterSpec {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new AdapterParseError(source, `invalid YAML: ${(err as Error).message}`);
  }
  const result = AdapterSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AdapterParseError(source, `invalid spec: ${issues}`);
  }
  return result.data;
}

export function loadAdapter(filePath: string): AdapterSpec {
  const text = readFileSync(filePath, 'utf8');
  return parseAdapter(text, filePath);
}

export function loadAllAdapters(dir: string = SPEC_DIR): Map<string, AdapterSpec> {
  if (!existsSync(dir)) {
    throw new Error(`adapter spec dir not found: ${dir}`);
  }
  const out = new Map<string, AdapterSpec>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const full = resolve(dir, entry);
    const adapter = loadAdapter(full);
    if (out.has(adapter.id)) {
      throw new AdapterParseError(full, `duplicate adapter id: ${adapter.id}`);
    }
    out.set(adapter.id, adapter);
  }
  return out;
}
