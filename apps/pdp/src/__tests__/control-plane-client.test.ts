import { generateKeypair, signDetached } from '@auto-nomos/crypto';
import { bytesToBase64url, canonicalize } from '@auto-nomos/ucan';
import { bytesToHex } from '@noble/hashes/utils';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createControlPlaneClient } from '../control-plane/client.js';

const logger = pino({ level: 'silent' });
const encoder = new TextEncoder();

function buildBundleResponse(customerId: string, signKey: Uint8Array, did: string) {
  const bundle = {
    customer_id: customerId,
    version: 1,
    generated_at: new Date().toISOString(),
    policies: [
      {
        id: 'p1',
        name: 'p1',
        integrationId: null,
        cedarText: 'permit(principal, action, resource);',
        version: 1,
      },
    ],
    schema_hash: 'a'.repeat(64),
  };
  const sig = signDetached(signKey, encoder.encode(canonicalize(bundle)));
  return { bundle, signature: bytesToBase64url(sig), signerDid: did };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('control-plane client', () => {
  it('fetchBundle returns concatenated cedarText when signature is valid', async () => {
    const kp = generateKeypair();
    const customerId = '550e8400-e29b-41d4-a716-446655440000';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(buildBundleResponse(customerId, kp.privateKey, kp.did)));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      bundleVerifyKey: bytesToHex(kp.publicKey),
      logger,
      fetchImpl,
    });
    const text = await client.fetchBundle(customerId);
    expect(text).toContain('permit');
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://cp/v1/internal/bundles/${customerId}`,
      expect.objectContaining({ headers: { authorization: 'Bearer t' } }),
    );
  });

  it('fetchBundle throws when signature mismatches the configured pubkey', async () => {
    const signer = generateKeypair();
    const otherSigner = generateKeypair();
    const customerId = '550e8400-e29b-41d4-a716-446655440001';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(buildBundleResponse(customerId, signer.privateKey, signer.did)),
      );
    const onSig = vi.fn();
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      bundleVerifyKey: bytesToHex(otherSigner.publicKey),
      logger,
      fetchImpl,
      onSignatureFailure: onSig,
    });
    await expect(client.fetchBundle(customerId)).rejects.toThrow(/signature verification failed/);
    expect(onSig).toHaveBeenCalled();
  });

  it('fetchBundle throws on customer-id mismatch (defends against replay across tenants)', async () => {
    const kp = generateKeypair();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(buildBundleResponse('OTHER-CUSTOMER', kp.privateKey, kp.did)),
      );
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      bundleVerifyKey: bytesToHex(kp.publicKey),
      logger,
      fetchImpl,
    });
    await expect(client.fetchBundle('REQUESTED-CUSTOMER')).rejects.toThrow(
      /bundle customer mismatch/,
    );
  });

  it('fetchBundle throws on 5xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    await expect(client.fetchBundle('c')).rejects.toThrow(/bundle fetch 503/);
  });

  it('fetchBundle skips signature verification when no verify key configured (dev-only)', async () => {
    const kp = generateKeypair();
    const customerId = '550e8400-e29b-41d4-a716-446655440002';
    const body = buildBundleResponse(customerId, kp.privateKey, kp.did);
    body.signature = bytesToBase64url(new Uint8Array(64)); // garbage signature

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
      // no bundleVerifyKey
    });
    const text = await client.fetchBundle(customerId);
    expect(text).toContain('permit');
  });

  it('fetchRevocations returns the revoked array', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ customer_id: 'c', revoked: ['cid-a', 'cid-b'] }));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    const revoked = await client.fetchRevocations('c');
    expect(revoked).toEqual(['cid-a', 'cid-b']);
  });

  it('fetchRevocations throws on 5xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 502 }));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    await expect(client.fetchRevocations('c')).rejects.toThrow(/revocations fetch 502/);
  });

  it('fetchOAuthToken returns the connector + access token', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        connectionId: 'conn-1',
        customerId: 'cust-1',
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_resolved',
        accessTokenExpiresAt: null,
        scopesGranted: ['repo'],
      }),
    );
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    const token = await client.fetchOAuthToken('cust-1', 'conn-1');
    expect(token.accessToken).toBe('gho_resolved');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://cp/v1/internal/oauth-tokens/conn-1?customerId=cust-1',
      expect.objectContaining({ headers: { authorization: 'Bearer t' } }),
    );
  });

  it('fetchOAuthToken throws OAuthTokenFetchError on non-2xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    await expect(client.fetchOAuthToken('cust-1', 'missing')).rejects.toMatchObject({
      name: 'OAuthTokenFetchError',
      status: 404,
    });
  });

  it('refreshOAuthToken POSTs to the refresh endpoint and parses the response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        connectionId: 'conn-2',
        customerId: 'cust-1',
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_refreshed',
        accessTokenExpiresAt: '2026-08-01T00:00:00.000Z',
        scopesGranted: ['repo'],
      }),
    );
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    const tok = await client.refreshOAuthToken('cust-1', 'conn-2');
    expect(tok.accessToken).toBe('gho_refreshed');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://cp/v1/internal/oauth-tokens/conn-2/refresh?customerId=cust-1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refreshOAuthToken throws OAuthTokenFetchError on 401 (refresh rejected)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const client = createControlPlaneClient({
      baseUrl: 'http://cp',
      serviceToken: 't',
      logger,
      fetchImpl,
    });
    await expect(client.refreshOAuthToken('cust-1', 'conn-x')).rejects.toMatchObject({
      name: 'OAuthTokenFetchError',
      status: 401,
    });
  });
});
