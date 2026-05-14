import type { NotionConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateNotionProxyCall } from '../adapters/notion.js';

describe('validateNotionProxyCall', () => {
  const pageId = 'ab12cd34ef567890abcdef1234567890';
  const pageIdDashed = 'ab12cd34-ef56-7890-abcd-ef1234567890';
  const pageConstraint: NotionConstraint = {
    provider: 'notion',
    page_id: pageId,
  };

  it('allows in-scope read on the pinned page', () => {
    expect(
      validateNotionProxyCall(pageConstraint, {
        method: 'GET',
        path: `/pages/${pageId}`,
      }),
    ).toEqual({ ok: true });
  });

  it('treats dashed and undashed UUIDs as equivalent', () => {
    expect(
      validateNotionProxyCall(pageConstraint, {
        method: 'GET',
        path: `/pages/${pageIdDashed}`,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a different page', () => {
    expect(
      validateNotionProxyCall(pageConstraint, {
        method: 'GET',
        path: '/pages/ffffffffffffffffffffffffffffffff',
      }),
    ).toEqual({ ok: false, reason: 'page_mismatch' });
  });

  it('rejects database query on a different database when constraint is database-scoped', () => {
    const dbId = '1111ffff1111ffff1111ffff1111ffff';
    const dbConstraint: NotionConstraint = { provider: 'notion', database_id: dbId };
    expect(
      validateNotionProxyCall(dbConstraint, {
        method: 'POST',
        path: '/databases/9999999999999999999999999999ffff/query',
        body: {},
      }),
    ).toEqual({ ok: false, reason: 'database_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateNotionProxyCall(pageConstraint, {
        method: 'GET',
        path: '/oauth/v2/something',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
