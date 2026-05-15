import { expandRolePermissions, type Role } from '@auto-nomos/rbac';
import { initTRPC, TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import type { Context } from '../context.js';
import { withPermission } from '../index.js';

function makeCtx(role: Role): Context {
  return {
    db: {} as Context['db'],
    logger: {} as Context['logger'],
    signing: { signKey: new Uint8Array(), signerDid: 'did:test' },
    revocationPublisher: { publishRevocation: async () => {} } as Context['revocationPublisher'],
    policyInvalidator: { invalidatePolicy: async () => {} } as Context['policyInvalidator'],
    webauthn: null,
    oauth: null,
    telegramBot: null,
    credsCache: null,
    cloudVerifyPoll: null,
    session: {
      user: { id: 'u1', email: 'u@x.test', name: null },
      token: 't',
    },
    customerId: 'c1',
    membership: { customerId: 'c1', role },
    permissions: expandRolePermissions(role),
  };
}

const t = initTRPC.context<Context>().create();
const caller = t.createCallerFactory(
  t.router({
    deleteAgents: withPermission('agents', 'delete').mutation(() => 'ok'),
    readAgents: withPermission('agents', 'read').query(() => 'ok'),
  }),
);

describe('withPermission middleware', () => {
  it('allows owner to delete agents', async () => {
    const c = caller(makeCtx('owner'));
    await expect(c.deleteAgents()).resolves.toBe('ok');
  });

  it('allows admin to delete agents', async () => {
    const c = caller(makeCtx('admin'));
    await expect(c.deleteAgents()).resolves.toBe('ok');
  });

  it('rejects auditor on delete agents with FORBIDDEN', async () => {
    const c = caller(makeCtx('auditor'));
    await expect(c.deleteAgents()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: /role auditor cannot delete agents/,
    });
  });

  it('allows auditor to read agents', async () => {
    const c = caller(makeCtx('auditor'));
    await expect(c.readAgents()).resolves.toBe('ok');
  });

  it('rejects member on read agents', async () => {
    const c = caller(makeCtx('member'));
    await expect(c.readAgents()).rejects.toBeInstanceOf(TRPCError);
  });

  it('rejects when membership is missing entirely', async () => {
    const ctx = makeCtx('owner');
    ctx.membership = null;
    ctx.permissions = null;
    ctx.customerId = null;
    const c = caller(ctx);
    await expect(c.deleteAgents()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects when session is missing', async () => {
    const ctx = makeCtx('owner');
    ctx.session = null;
    const c = caller(ctx);
    await expect(c.deleteAgents()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
