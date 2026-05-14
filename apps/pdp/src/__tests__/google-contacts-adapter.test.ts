import type { GoogleContactsConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleContactsProxyCall } from '../adapters/google_contacts.js';

describe('validateGoogleContactsProxyCall', () => {
  const personConstraint: GoogleContactsConstraint = {
    provider: 'google_contacts',
    resource_name: 'people/c123',
  };

  it('allows in-scope read of the pinned person', () => {
    expect(
      validateGoogleContactsProxyCall(personConstraint, {
        method: 'GET',
        path: '/people/c123',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a different resource_name', () => {
    expect(
      validateGoogleContactsProxyCall(personConstraint, {
        method: 'GET',
        path: '/people/c999',
      }),
    ).toEqual({ ok: false, reason: 'resource_name_mismatch' });
  });

  it('allows listing connections', () => {
    // Unconstrained pack-wide listing is allowed when no resource_name is pinned.
    const uc: GoogleContactsConstraint = { provider: 'google_contacts' };
    expect(
      validateGoogleContactsProxyCall(uc, {
        method: 'GET',
        path: '/people/me/connections',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateGoogleContactsProxyCall(personConstraint, {
        method: 'GET',
        path: '/documents/abc',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
