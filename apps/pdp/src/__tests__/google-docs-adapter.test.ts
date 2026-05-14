import type { GoogleDocsConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleDocsProxyCall } from '../adapters/google_docs.js';

describe('validateGoogleDocsProxyCall', () => {
  const docConstraint: GoogleDocsConstraint = {
    provider: 'google_docs',
    document_id: 'doc_1',
  };

  it('allows in-scope read of the pinned document', () => {
    expect(
      validateGoogleDocsProxyCall(docConstraint, {
        method: 'GET',
        path: '/documents/doc_1',
      }),
    ).toEqual({ ok: true });
  });

  it('allows batchUpdate against the pinned document', () => {
    expect(
      validateGoogleDocsProxyCall(docConstraint, {
        method: 'POST',
        path: '/documents/doc_1:batchUpdate',
        body: { requests: [] },
      }),
    ).toEqual({ ok: true });
  });

  it('rejects batchUpdate against a different document', () => {
    expect(
      validateGoogleDocsProxyCall(docConstraint, {
        method: 'POST',
        path: '/documents/doc_OTHER:batchUpdate',
        body: { requests: [] },
      }),
    ).toEqual({ ok: false, reason: 'document_mismatch' });
  });

  it('rejects non-docs paths', () => {
    expect(
      validateGoogleDocsProxyCall(docConstraint, {
        method: 'GET',
        path: '/files/doc_1',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
