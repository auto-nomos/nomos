import { describe, expect, it } from 'vitest';
import { applySanitize } from '../sanitize.js';

describe('sanitize', () => {
  it('redacts top-level field', () => {
    const out = applySanitize({ name: 'me', email: 'me@x.com' }, [
      { field: 'email', redact: true, hash: false },
    ]);
    expect(out).toEqual({ name: 'me', email: '[REDACTED]' });
  });

  it('redacts nested field', () => {
    const out = applySanitize({ user: { id: 1, secret: 'abc' } }, [
      { field: 'user.secret', redact: true, hash: false },
    ]);
    expect(out).toEqual({ user: { id: 1, secret: '[REDACTED]' } });
  });

  it('descends into array elements', () => {
    const out = applySanitize(
      {
        items: [
          { id: 1, token: 'a' },
          { id: 2, token: 'b' },
        ],
      },
      [{ field: 'items[].token', redact: true, hash: false }],
    );
    expect(out).toEqual({
      items: [
        { id: 1, token: '[REDACTED]' },
        { id: 2, token: '[REDACTED]' },
      ],
    });
  });

  it('truncates long strings', () => {
    const out = applySanitize({ body: '0123456789' }, [
      { field: 'body', redact: false, hash: false, truncate: 4 },
    ]);
    expect(out).toEqual({ body: '0123…' });
  });

  it('does not mutate input', () => {
    const input = { secret: 'x' };
    applySanitize(input, [{ field: 'secret', redact: true, hash: false }]);
    expect(input).toEqual({ secret: 'x' });
  });

  it('handles missing field gracefully', () => {
    const out = applySanitize({ a: 1 }, [{ field: 'b.c.d', redact: true, hash: false }]);
    expect(out).toEqual({ a: 1 });
  });

  it('applies multiple rules', () => {
    const out = applySanitize({ a: 'sec', b: 'long-string', c: 'keep' }, [
      { field: 'a', redact: true, hash: false },
      { field: 'b', redact: false, hash: false, truncate: 4 },
    ]);
    expect(out).toEqual({ a: '[REDACTED]', b: 'long…', c: 'keep' });
  });
});
