import type { CloudConnectionRef } from '@auto-nomos/core';
import { describe, expect, it, vi } from 'vitest';
import { GcpCloudProvider } from '../cloud/providers/gcp.js';

function fixtureConnection(): CloudConnectionRef {
  return {
    id: 'conn-gcp',
    customerId: 'cust',
    connector: 'gcp',
    accountId: 'my-project',
    tenantId: null,
    externalId: 'projects/12345/locations/global/workloadIdentityPools/nomos/providers/nomos-oidc',
    config: {
      wif_provider:
        'projects/12345/locations/global/workloadIdentityPools/nomos/providers/nomos-oidc',
      service_account_email: 'nomos-agent@my-project.iam.gserviceaccount.com',
    },
  };
}

describe('GcpCloudProvider.acquireSessionCreds', () => {
  it('runs the two-hop STS + impersonation flow', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith('https://sts.test/v1/token')) {
        const body = String(init?.body ?? '');
        expect(body).toContain('subject_token=oidc-fed-token');
        expect(body).toContain(
          'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange',
        );
        return new Response(JSON.stringify({ access_token: 'fed-tok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.includes(':generateAccessToken')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer fed-tok');
        return new Response(
          JSON.stringify({
            accessToken: 'gcp-sa-token',
            expireTime: '2030-01-01T00:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('nope', { status: 500 });
    }) as unknown as typeof fetch;

    const provider = new GcpCloudProvider({
      fetch: fetchMock,
      stsHost: 'https://sts.test',
      iamCredentialsHost: 'https://iamcredentials.test',
    });
    const creds = await provider.acquireSessionCreds(fixtureConnection(), 'oidc-fed-token');
    expect(creds.kind).toBe('gcp_bearer');
    if (creds.kind === 'gcp_bearer') {
      expect(creds.accessToken).toBe('gcp-sa-token');
    }
    expect(calls).toHaveLength(2);
  });

  it('rejects connections missing wif_provider or SA', async () => {
    const provider = new GcpCloudProvider({ fetch: vi.fn() as unknown as typeof fetch });
    await expect(
      provider.acquireSessionCreds({ ...fixtureConnection(), config: {} }, 't'),
    ).rejects.toThrow(/missing_wif_provider/);
    await expect(
      provider.acquireSessionCreds({ ...fixtureConnection(), config: { wif_provider: 'x' } }, 't'),
    ).rejects.toThrow(/missing_service_account_email/);
  });

  it('signAndCall attaches bearer + base host', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> | undefined;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const provider = new GcpCloudProvider({ fetch: fetchMock });
    const res = await provider.signAndCall(
      {
        kind: 'gcp_bearer',
        accessToken: 'gcp-tok',
        expiresAt: new Date(Date.now() + 60_000),
      },
      { method: 'GET', url: '/compute/v1/projects/my-project/zones/us-central1-a/instances' },
    );
    expect(res.status).toBe(200);
    expect(capturedUrl).toMatch(/^https:\/\/www\.googleapis\.com\/compute/);
    expect(capturedHeaders?.authorization).toBe('Bearer gcp-tok');
  });
});
