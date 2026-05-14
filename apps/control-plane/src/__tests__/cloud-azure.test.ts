/**
 * Pure unit tests for the Azure CloudProvider — no DB, mocked AAD + ARM.
 *
 * Covers token-exchange happy path, AAD error mapping, and signAndCall
 * attaching the bearer + parsing ARM responses.
 */

import type { CloudConnectionRef } from '@auto-nomos/core';
import { describe, expect, it, vi } from 'vitest';
import { AzureCloudProvider } from '../cloud/providers/azure.js';

function fixtureConnection(): CloudConnectionRef {
  return {
    id: 'conn-1',
    customerId: 'cust-1',
    connector: 'azure',
    accountId: 'sub-uuid',
    tenantId: 'tenant-uuid',
    externalId: 'app-object-id',
    config: { app_client_id: 'client-id-abc' },
  };
}

describe('AzureCloudProvider.acquireSessionCreds', () => {
  it('exchanges the ID token for an AAD bearer token', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://aad.test/tenant-uuid/oauth2/v2.0/token');
      const body = String(init?.body ?? '');
      expect(body).toContain('grant_type=client_credentials');
      expect(body).toContain('client_id=client-id-abc');
      expect(body).toContain('client_assertion=fake-id-token');
      expect(body).toContain('client_assertion_type=urn');
      return new Response(
        JSON.stringify({ access_token: 'aad-bearer-xyz', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const provider = new AzureCloudProvider({ fetch: fetchMock, aadHost: 'https://aad.test' });
    const creds = await provider.acquireSessionCreds(fixtureConnection(), 'fake-id-token');
    expect(creds.kind).toBe('azure_bearer');
    if (creds.kind === 'azure_bearer') {
      expect(creds.accessToken).toBe('aad-bearer-xyz');
      expect(creds.scope).toBe('https://management.azure.com/.default');
      expect(creds.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500 * 1000);
    }
  });

  it('throws CloudFederationError on AAD 4xx', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_client', error_description: 'Bad assertion' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    const provider = new AzureCloudProvider({ fetch: fetchMock, aadHost: 'https://aad.test' });
    await expect(provider.acquireSessionCreds(fixtureConnection(), 'bad')).rejects.toThrow(
      /aad_token_exchange_failed_401/,
    );
  });

  it('marks 5xx + 429 as retryable', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('throttled', {
          status: 429,
          headers: { 'content-type': 'text/plain' },
        }),
    ) as unknown as typeof fetch;
    const provider = new AzureCloudProvider({ fetch: fetchMock, aadHost: 'https://aad.test' });
    try {
      await provider.acquireSessionCreds(fixtureConnection(), 'tok');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as { retryable?: boolean }).retryable).toBe(true);
    }
  });

  it('rejects connections missing tenant or app_client_id', async () => {
    const provider = new AzureCloudProvider({ fetch: vi.fn() as unknown as typeof fetch });
    await expect(
      provider.acquireSessionCreds({ ...fixtureConnection(), tenantId: null }, 'tok'),
    ).rejects.toThrow(/missing_tenant_id/);
    await expect(
      provider.acquireSessionCreds({ ...fixtureConnection(), config: {} }, 'tok'),
    ).rejects.toThrow(/missing_app_client_id/);
  });
});

describe('AzureCloudProvider.signAndCall', () => {
  it('attaches bearer + builds ARM URL with query', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        'https://arm.test/subscriptions/sub-uuid/resourcegroups?api-version=2021-04-01',
      );
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer aad-bearer-xyz');
      expect(init?.method).toBe('GET');
      return new Response(JSON.stringify({ value: [{ name: 'rg-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const provider = new AzureCloudProvider({ fetch: fetchMock, armHost: 'https://arm.test' });
    const res = await provider.signAndCall(
      {
        kind: 'azure_bearer',
        accessToken: 'aad-bearer-xyz',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        scope: 'https://management.azure.com/.default',
      },
      {
        method: 'GET',
        url: '/subscriptions/sub-uuid/resourcegroups',
        query: { 'api-version': '2021-04-01' },
      },
    );
    expect(res.status).toBe(200);
    const body = res.body as { value: Array<{ name: string }> };
    expect(body.value[0]?.name).toBe('rg-1');
  });

  it('rejects mismatched creds kind', async () => {
    const provider = new AzureCloudProvider();
    await expect(
      provider.signAndCall(
        {
          kind: 'aws_sigv4',
          accessKeyId: 'a',
          secretAccessKey: 'b',
          sessionToken: 'c',
          expiresAt: new Date(),
          region: 'us-east-1',
        },
        { method: 'GET', url: 'x' },
      ),
    ).rejects.toThrow(/creds_kind_mismatch/);
  });
});

describe('audienceFor', () => {
  it('returns api://AzureADTokenExchange', () => {
    const provider = new AzureCloudProvider();
    const aud = provider.audienceFor(fixtureConnection());
    expect(aud.audience).toBe('api://AzureADTokenExchange');
    expect(aud.ttlSeconds).toBe(300);
  });
});
