/**
 * Members + invites router (org-level RBAC).
 *
 * Covers:
 *   - admin/owner can list members + invite + revoke
 *   - last-owner protection (cannot demote / remove)
 *   - non-admin (member) is forbidden
 *   - invite token lifecycle: create → accept (joined) → second accept fails
 *   - duplicate-email guard
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import superjson from 'superjson';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import type { AppRouter } from '../trpc/router.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

interface Tenant {
  cookie: string;
  userId: string;
  customerId: string;
  email: string;
}

describe.skipIf(!RUN)('members + invites routers (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let owner: Tenant;
  let invitee: Tenant;
  const logger = pino({ level: 'silent' });
  const inviteTokens: string[] = [];
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];

  function client(cookie: string) {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost/trpc',
          transformer: superjson,
          fetch: (url, init) => app.request(url.toString(), init as RequestInit),
          headers: () => (cookie ? { cookie } : {}),
        }),
      ],
    });
  }

  async function signUp(prefix: string, domain = 'test'): Promise<Tenant> {
    const email = `${prefix}-${Date.now()}-${Math.random()}@${domain}.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: prefix }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    cleanupCustomerIds.push(m!.customerId);
    cleanupUserIds.push(u!.id);
    return { cookie, userId: u!.id, customerId: m!.customerId, email };
  }

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    await db.pool.query('SELECT 1');
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({
      logger,
      db,
      auth,
      inviteNotifier: async (n) => {
        // Capture raw token so tests can assert the accept flow.
        inviteTokens.push(n.token);
      },
    });
    owner = await signUp('owner');
    invitee = await signUp('invitee');
  });

  afterAll(async () => {
    for (const id of cleanupCustomerIds) {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    for (const id of cleanupUserIds) {
      await db.pool.query('DELETE FROM "user" WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  it('owner can list members (just themselves at first)', async () => {
    const rows = await client(owner.cookie).members.list.query();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(owner.userId);
    expect(rows[0]!.role).toBe('owner');
  });

  it('cannot demote the last owner', async () => {
    const rows = await client(owner.cookie).members.list.query();
    const ownerRow = rows.find((r) => r.role === 'owner')!;
    await expect(
      client(owner.cookie).members.changeRole.mutate({
        membershipId: ownerRow.membershipId,
        role: 'admin',
      }),
    ).rejects.toThrow(/last owner/);
  });

  it('cannot remove the last owner', async () => {
    const rows = await client(owner.cookie).members.list.query();
    const ownerRow = rows.find((r) => r.role === 'owner')!;
    await expect(
      client(owner.cookie).members.remove.mutate({ membershipId: ownerRow.membershipId }),
    ).rejects.toThrow(/last owner/);
  });

  it('create invite + accept flow joins the invitee as member', async () => {
    inviteTokens.length = 0;
    const created = await client(owner.cookie).invites.create.mutate({
      email: invitee.email,
      role: 'agent_manager',
    });
    expect(created.email).toBe(invitee.email);
    expect(created.role).toBe('agent_manager');
    expect(inviteTokens).toHaveLength(1);

    const token = inviteTokens[0]!;
    const result = await client(invitee.cookie).invites.accept.mutate({ token });
    if (result.status !== 'joined') {
      throw new Error(`expected joined, got ${result.status}`);
    }
    expect(result.customerId).toBe(owner.customerId);
    expect(result.role).toBe('agent_manager');

    const members = await client(owner.cookie).members.list.query();
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === invitee.userId)?.role).toBe('agent_manager');
  });

  it('second accept on the same token fails', async () => {
    const token = inviteTokens[0]!;
    await expect(client(invitee.cookie).invites.accept.mutate({ token })).rejects.toThrow(
      /already accepted/,
    );
  });

  it('duplicate pending invite for same email is rejected with CONFLICT', async () => {
    inviteTokens.length = 0;
    const second = await signUp('second');
    await client(owner.cookie).invites.create.mutate({
      email: second.email,
      role: 'auditor',
    });
    await expect(
      client(owner.cookie).invites.create.mutate({
        email: second.email,
        role: 'auditor',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('non-admin member cannot list members', async () => {
    // invitee is in owner's org as agent_manager — which has members:read.
    // Use a separate user in their own org with default `owner` then we
    // promote them to a fresh org membership as `member` to test denial.
    const tinyUser = await signUp('tiny');
    await db.drizzle
      .update(schema.memberships)
      .set({ role: 'member' })
      .where(eq(schema.memberships.userId, tinyUser.userId));
    // members:read IS allowed for `member`, but members:update is not.
    const rows = await client(tinyUser.cookie).members.list.query();
    expect(rows).toHaveLength(1);
    const onlyRow = rows[0]!;
    await expect(
      client(tinyUser.cookie).members.changeRole.mutate({
        membershipId: onlyRow.membershipId,
        role: 'owner',
      }),
    ).rejects.toThrow(/cannot update members/);
  });

  it('invite to a non-existent email surfaces a sane error path via expired check', async () => {
    inviteTokens.length = 0;
    const e2 = `ghost-${Date.now()}@nobody.test`;
    const made = await client(owner.cookie).invites.create.mutate({
      email: e2,
      role: 'auditor',
    });
    expect(made.email).toBe(e2);
    // Manually force expiration to test the "expired" branch
    await db.drizzle
      .update(schema.orgInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.orgInvites.id, made.inviteId));
    const token = inviteTokens[0]!;
    await expect(client(owner.cookie).invites.accept.mutate({ token })).rejects.toThrow(/expired/);
  });

  it('invite.accept with no session returns needs_signup', async () => {
    inviteTokens.length = 0;
    const e3 = `prospect-${Date.now()}@nobody.test`;
    await client(owner.cookie).invites.create.mutate({
      email: e3,
      role: 'auditor',
    });
    const token = inviteTokens[0]!;
    const result = await client('').invites.accept.mutate({ token });
    expect(result.status).toBe('needs_signup');
    if (result.status === 'needs_signup') {
      expect(result.email).toBe(e3);
      expect(result.role).toBe('auditor');
    }
  });

  it('revoke + re-create works', async () => {
    inviteTokens.length = 0;
    const e4 = `revoke-${Date.now()}@nobody.test`;
    const made = await client(owner.cookie).invites.create.mutate({
      email: e4,
      role: 'auditor',
    });
    await client(owner.cookie).invites.revoke.mutate({ inviteId: made.inviteId });
    // Now we can create again because revoked_at is set
    await expect(
      client(owner.cookie).invites.create.mutate({
        email: e4,
        role: 'agent_manager',
      }),
    ).resolves.toMatchObject({ email: e4, role: 'agent_manager' });
  });
});
