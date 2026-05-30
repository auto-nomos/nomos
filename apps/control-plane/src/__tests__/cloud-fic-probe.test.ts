/**
 * Per-agent FIC probe — `createCloudVerifyPoll().probeFic`.
 *
 * Drives the dashboard's "register this app's federated credential" card:
 * runs the real federation handshake under the agent's subject and maps the
 * outcome to registered / missing (AADSTS700213) / error. mintIdToken is
 * mocked so the test needs no RSA key.
 */

import { type CloudConnectorId, CloudFederationError, type CloudProvider } from '@auto-nomos/core';
import type { JwtSigner } from '@auto-nomos/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrizzleClient } from '../db/index.js';
import type { Logger } from '../logger.js';
import { createCloudVerifyPoll } from '../workers/cloud-verify-poll.js';

vi.mock('../oidc/mint.js', () => ({
  mintIdToken: vi.fn(async () => ({
    token: 'fake-id-token',
    kid: 'kid-1',
    jti: 'jti-1',
    sub: 'customer/cust-1/agent/agent-1',
    expiresAt: new Date(0),
  })),
}));

const ROW = {
  id: 'conn-1',
  customerId: 'cust-1',
  connector: 'azure' as const,
  accountId: 'sub-uuid',
  tenantId: 'tenant-uuid',
  externalId: 'app-object-id',
  config: { app_client_id: 'client-id-abc' },
  bootstrapStatus: 'verified',
  displayName: null,
  lastVerifiedAt: null,
  lastVerifyError: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function fakeDb(row: typeof ROW | null): DrizzleClient {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => (row ? [row] : []),
  };
  return { select: () => chain } as unknown as DrizzleClient;
}

function makePoll(acquire: CloudProvider['acquireSessionCreds'], row: typeof ROW | null = ROW) {
  const provider: CloudProvider = {
    id: 'azure',
    audienceFor: () => ({ audience: 'api://AzureADTokenExchange', ttlSeconds: 300 }),
    acquireSessionCreds: acquire,
    signAndCall: vi.fn(),
  };
  const registry = new Map<CloudConnectorId, CloudProvider>([['azure', provider]]);
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
  return createCloudVerifyPoll({
    db: fakeDb(row),
    registry,
    signer: {} as JwtSigner,
    issuer: 'https://id.auto-nomos.com',
    defaultTtlSeconds: 300,
    logger,
  });
}

describe('probeFic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns registered when the handshake succeeds', async () => {
    const poll = makePoll(
      vi.fn(async () => ({
        kind: 'azure_bearer' as const,
        accessToken: 'tok',
        expiresAt: new Date(Date.now() + 3600_000),
        scope: 'https://management.azure.com/.default',
      })),
    );
    expect(await poll.probeFic('conn-1', 'cust-1', 'agent-1')).toEqual({ state: 'registered' });
  });

  it('returns missing when AAD reports AADSTS700213', async () => {
    const poll = makePoll(
      vi.fn(async () => {
        throw new CloudFederationError('aad_token_exchange_failed_400', 400, {
          error: 'invalid_request',
          error_description:
            'AADSTS700213: No matching federated identity record found for presented assertion subject.',
        });
      }),
    );
    expect(await poll.probeFic('conn-1', 'cust-1', 'agent-1')).toEqual({ state: 'missing' });
  });

  it('returns error on any other federation failure', async () => {
    const poll = makePoll(
      vi.fn(async () => {
        throw new CloudFederationError('aad_token_exchange_failed_401', 401, {
          error: 'invalid_client',
          error_description: 'Bad assertion',
        });
      }),
    );
    const res = await poll.probeFic('conn-1', 'cust-1', 'agent-1');
    expect(res.state).toBe('error');
    expect(res.detail).toMatch(/401/);
  });

  it('returns error when the connection is not found', async () => {
    const poll = makePoll(vi.fn(), null);
    expect(await poll.probeFic('missing', 'cust-1', 'agent-1')).toEqual({
      state: 'error',
      detail: 'connection_not_found',
    });
  });
});
