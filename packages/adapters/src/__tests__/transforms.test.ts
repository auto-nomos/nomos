import { describe, expect, it } from 'vitest';
import { evalExpression, TransformError } from '../transforms.js';

describe('transforms', () => {
  it('returns string literal', () => {
    expect(evalExpression("'hello'")).toBe('hello');
    expect(evalExpression('"hello"')).toBe('hello');
  });

  it('returns numbers', () => {
    expect(evalExpression('42')).toBe(42);
    expect(evalExpression('3.14')).toBe(3.14);
  });

  it('returns booleans + null', () => {
    expect(evalExpression('true')).toBe(true);
    expect(evalExpression('false')).toBe(false);
    expect(evalExpression('null')).toBe(null);
  });

  it('looks up identifiers in context', () => {
    expect(evalExpression('foo', { foo: 'bar' })).toBe('bar');
  });

  it('descends member chain', () => {
    expect(evalExpression('params.repo', { params: { repo: 'cb' } })).toBe('cb');
    expect(evalExpression('a.b.c', { a: { b: { c: 7 } } })).toBe(7);
  });

  it('returns undefined for missing path', () => {
    expect(evalExpression('a.b.c', { a: {} })).toBeUndefined();
  });

  it('calls now() returning ISO string', () => {
    const result = evalExpression('now()') as string;
    expect(typeof result).toBe('string');
    expect(() => new Date(result)).not.toThrow();
  });

  it('rfc3339 normalizes Date input', () => {
    const out = evalExpression('rfc3339(now())') as string;
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uuid returns v4 string', () => {
    const id = evalExpression('uuid()') as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('lower / upper', () => {
    expect(evalExpression("lower('HELLO')")).toBe('hello');
    expect(evalExpression("upper('hi')")).toBe('HI');
  });

  it('coalesce picks first non-empty', () => {
    expect(evalExpression("coalesce('', null, 'x')")).toBe('x');
    expect(evalExpression("coalesce('a', 'b')")).toBe('a');
  });

  it('default with member access', () => {
    expect(evalExpression("default(params.x, 'fallback')", { params: {} })).toBe('fallback');
    expect(evalExpression("default(params.x, 'fallback')", { params: { x: 'set' } })).toBe('set');
  });

  it('rejects unknown function', () => {
    expect(() => evalExpression('eval(1)')).toThrow(TransformError);
  });

  it('rejects unbalanced parens', () => {
    expect(() => evalExpression('now(')).toThrow(TransformError);
  });

  it('rejects unexpected character', () => {
    expect(() => evalExpression('a + b')).toThrow(TransformError);
  });

  it('rejects unterminated string', () => {
    expect(() => evalExpression("'oops")).toThrow(TransformError);
  });
});
