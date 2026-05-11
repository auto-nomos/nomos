/**
 * Tiny whitelisted expression evaluator.
 *
 * Grammar (recursive descent):
 *   expr      := primary
 *   primary   := call | member | string | number | bool | null
 *   call      := IDENT '(' (expr (',' expr)*)? ')'
 *   member    := IDENT ('.' IDENT)*
 *   string    := "'..."  |  "..."
 *
 * Functions:
 *   now()                 - ISO timestamp string (epoch-ms-precision)
 *   rfc3339(date|string)  - normalize to RFC3339 / ISO string
 *   uuid()                - random UUIDv4
 *   lower(s) / upper(s)
 *   coalesce(a, b, ...)   - first non-empty / non-null / non-undefined
 *   default(a, b)         - alias for coalesce(a, b)
 *
 * Identifiers resolve against a context object: e.g. `params.repo`.
 *
 * Strict whitelist — anything else throws TransformError.
 */
import { randomUUID } from 'node:crypto';

export class TransformError extends Error {
  override name = 'TransformError';
}

export interface TransformContext {
  params?: Record<string, unknown>;
  response?: unknown;
  [key: string]: unknown;
}

const FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  now: () => new Date().toISOString(),
  rfc3339: (d: unknown) => {
    if (d instanceof Date) return d.toISOString();
    if (typeof d === 'string') return new Date(d).toISOString();
    if (typeof d === 'number') return new Date(d).toISOString();
    throw new TransformError(`rfc3339: unsupported argument ${typeof d}`);
  },
  uuid: () => randomUUID(),
  lower: (s: unknown) => String(s ?? '').toLowerCase(),
  upper: (s: unknown) => String(s ?? '').toUpperCase(),
  coalesce: (...vals: unknown[]) =>
    vals.find((v) => v !== undefined && v !== null && v !== '') ?? null,
  default: (a: unknown, b: unknown) => (a === undefined || a === null || a === '' ? b : a),
};

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'dot' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? '';
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      out.push({ kind: 'comma' });
      i++;
      continue;
    }
    if (ch === '.') {
      out.push({ kind: 'dot' });
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let end = i + 1;
      while (end < src.length && src[end] !== quote) {
        if (src[end] === '\\') end++;
        end++;
      }
      if (end >= src.length) throw new TransformError(`unterminated string literal at ${i}`);
      out.push({ kind: 'string', value: src.slice(i + 1, end).replace(/\\(.)/g, '$1') });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let end = i + 1;
      while (end < src.length && /[0-9.]/.test(src[end] ?? '')) end++;
      out.push({ kind: 'number', value: Number(src.slice(i, end)) });
      i = end;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let end = i + 1;
      while (end < src.length && /[a-zA-Z0-9_]/.test(src[end] ?? '')) end++;
      out.push({ kind: 'ident', value: src.slice(i, end) });
      i = end;
      continue;
    }
    throw new TransformError(`unexpected character '${ch}' at ${i}`);
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly ctx: TransformContext,
  ) {}

  parse(): unknown {
    const v = this.expr();
    if (this.pos !== this.tokens.length) {
      throw new TransformError(`unexpected trailing tokens at ${this.pos}`);
    }
    return v;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new TransformError('unexpected end of expression');
    this.pos++;
    return t;
  }

  private expr(): unknown {
    return this.primary();
  }

  private primary(): unknown {
    const t = this.peek();
    if (!t) throw new TransformError('unexpected end of expression');
    if (t.kind === 'string') {
      this.consume();
      return t.value;
    }
    if (t.kind === 'number') {
      this.consume();
      return t.value;
    }
    if (t.kind === 'ident') {
      const ident = this.consume() as Extract<Token, { kind: 'ident' }>;
      // bool / null literals
      if (ident.value === 'true') return true;
      if (ident.value === 'false') return false;
      if (ident.value === 'null') return null;
      // function call
      if (this.peek()?.kind === 'lparen') {
        this.consume(); // '('
        const args: unknown[] = [];
        if (this.peek()?.kind !== 'rparen') {
          args.push(this.expr());
          while (this.peek()?.kind === 'comma') {
            this.consume();
            args.push(this.expr());
          }
        }
        const close = this.consume();
        if (close.kind !== 'rparen') {
          throw new TransformError(`expected ')' after function args`);
        }
        const fn = FUNCTIONS[ident.value];
        if (!fn) throw new TransformError(`unknown function: ${ident.value}`);
        return fn(...args);
      }
      // member access chain
      const path: string[] = [ident.value];
      while (this.peek()?.kind === 'dot') {
        this.consume();
        const next = this.consume();
        if (next.kind !== 'ident') {
          throw new TransformError(`expected identifier after '.'`);
        }
        path.push(next.value);
      }
      return this.lookup(path);
    }
    throw new TransformError(`unexpected token: ${t.kind}`);
  }

  private lookup(path: string[]): unknown {
    let cur: unknown = this.ctx;
    for (const seg of path) {
      if (cur === null || cur === undefined) return undefined;
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }
}

export function evalExpression(expr: string, ctx: TransformContext = {}): unknown {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return undefined;
  return new Parser(tokens, ctx).parse();
}
