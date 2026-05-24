/**
 * Unit tests for the encrypt/decrypt helpers in oauth/tokens.ts that don't
 * need postgres — exercise all four refresh/access empty-vs-present quadrants
 * so the coverage gate doesn't depend on which integration DB is reachable.
 */

import { generateSecretboxKeyHex } from '@auto-nomos/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleClient } from '../../db/index.js';
import {
  __test,
  loadConnection,
  loadConnectionById,
  updateConnectionTokens,
} from '../../oauth/tokens.js';

const key = hexToBytes(generateSecretboxKeyHex());
const baseDeps = { db: {} as DrizzleClient, encryptionKey: key };

describe('tokens.tokensToRow / rowToTokens (no DB)', () => {
  const ctx = { customerId: 'cust', connector: 'github' };
  const empty = (over: Partial<Parameters<typeof __test.tokensToRow>[1]>) => ({
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scopesGranted: [],
    accountId: 'acc',
    ...over,
  });

  it('encrypts both tokens when both present', () => {
    const row = __test.tokensToRow(baseDeps, empty({ accessToken: 'a', refreshToken: 'r' }), ctx);
    expect(row.encryptedAccessToken).not.toBe(null);
    expect(row.encryptedAccessToken).not.toBe('a');
    expect(row.encryptedRefreshToken).not.toBe('');
    expect(row.encryptedRefreshToken).not.toBe('r');
  });

  it('leaves access fields null when access token is empty', () => {
    const row = __test.tokensToRow(baseDeps, empty({ refreshToken: 'r' }), ctx);
    expect(row.encryptedAccessToken).toBeNull();
    expect(row.accessTokenNonce).toBeNull();
    expect(row.encryptedRefreshToken).not.toBe('');
  });

  it('leaves refresh fields empty-string when refresh token is empty', () => {
    const row = __test.tokensToRow(baseDeps, empty({ accessToken: 'a' }), ctx);
    expect(row.encryptedRefreshToken).toBe('');
    expect(row.refreshTokenNonce).toBe('');
    expect(row.encryptedAccessToken).not.toBe(null);
  });

  it('handles both tokens empty (paranoid case — non-revoked connection with no cached creds yet)', () => {
    const row = __test.tokensToRow(baseDeps, empty({}), ctx);
    expect(row.encryptedRefreshToken).toBe('');
    expect(row.encryptedAccessToken).toBeNull();
  });

  it('rowToTokens decrypts only what is present', () => {
    const row = __test.tokensToRow(baseDeps, empty({ refreshToken: 'r' }), ctx);
    const decoded = __test.rowToTokens(baseDeps, {
      id: 'id',
      customerId: 'cust',
      connector: 'github',
      accountId: 'acc',
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Parameters<typeof __test.rowToTokens>[1]);
    expect(decoded.refreshToken).toBe('r');
    expect(decoded.accessToken).toBe('');
  });

  it('rowToTokens treats blank refresh ciphertext as no-refresh-token (notion-shaped row)', () => {
    const decoded = __test.rowToTokens(baseDeps, {
      id: 'id',
      customerId: 'cust',
      connector: 'notion',
      accountId: 'ws_1',
      encryptedRefreshToken: '',
      refreshTokenNonce: '',
      refreshTokenExpiresAt: null,
      encryptedAccessToken: null,
      accessTokenNonce: null,
      accessTokenExpiresAt: null,
      scopesGranted: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Parameters<typeof __test.rowToTokens>[1]);
    expect(decoded.refreshToken).toBe('');
    expect(decoded.accessToken).toBe('');
  });
});

describe('tokens.loadConnection / loadConnectionById / updateConnectionTokens (mocked DB)', () => {
  it('loadConnection returns null when no row matches', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const fakeDb = {
      query: { oauthConnections: { findFirst } },
    } as unknown as DrizzleClient;
    expect(await loadConnection({ db: fakeDb, encryptionKey: key }, 'cust', 'github')).toBeNull();
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('loadConnectionById returns null when no row matches', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const fakeDb = {
      query: { oauthConnections: { findFirst } },
    } as unknown as DrizzleClient;
    expect(
      await loadConnectionById({ db: fakeDb, encryptionKey: key }, 'cust', 'conn-id'),
    ).toBeNull();
  });

  it('updateConnectionTokens throws when the connection does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const fakeDb = {
      query: { oauthConnections: { findFirst } },
      update,
    } as unknown as DrizzleClient;
    await expect(
      updateConnectionTokens({ db: fakeDb, encryptionKey: key }, 'missing', {
        accessToken: 'a',
        refreshToken: 'r',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: [],
        accountId: 'x',
      }),
    ).rejects.toThrow(/missing not found/);
  });
});
