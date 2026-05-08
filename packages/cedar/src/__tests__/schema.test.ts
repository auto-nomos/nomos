import { describe, expect, it } from 'vitest';
import { validateSchema } from '../schema.js';

describe('validateSchema', () => {
  it('accepts a minimal valid schema', () => {
    const res = validateSchema({
      Demo: {
        entityTypes: {
          User: { shape: { type: 'Record', attributes: {} } },
        },
        actions: {
          read: {
            appliesTo: { principalTypes: ['Demo::User'], resourceTypes: [] },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects an empty/invalid schema string', () => {
    const res = validateSchema('not a schema');
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('rejects a JSON schema with an unknown entityType reference', () => {
    const res = validateSchema({
      Demo: {
        entityTypes: {
          User: { shape: { type: 'Record', attributes: {} } },
        },
        actions: {
          read: {
            appliesTo: {
              principalTypes: ['Demo::User'],
              resourceTypes: ['Demo::Missing'],
            },
          },
        },
      },
    });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('accepts a Cedar-syntax schema string', () => {
    const text = `namespace Demo {
      entity User;
      entity Document;
      action read appliesTo { principal: [User], resource: [Document] };
    }`;
    expect(validateSchema(text).ok).toBe(true);
  });
});
