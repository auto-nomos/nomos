import { type Action, hasPermission, type Resource, type Role } from '@auto-nomos/rbac';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const requireSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'sign-in required' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

const requireMembership = requireSession.unstable_pipe(({ ctx, next }) => {
  if (!ctx.customerId || !ctx.membership || !ctx.permissions) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'no active customer membership',
    });
  }
  return next({
    ctx: {
      ...ctx,
      customerId: ctx.customerId,
      membership: ctx.membership,
      permissions: ctx.permissions,
      role: ctx.membership.role as Role,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireSession);
export const tenantProcedure = t.procedure.use(requireMembership);

/**
 * Permission-gated procedure builder.
 *
 *   const create = withPermission('agents', 'create')
 *     .input(...).mutation(async ({ ctx }) => { ... });
 *
 * Consults the @auto-nomos/rbac matrix using the role on the active
 * membership. Throws FORBIDDEN when the role lacks the requested permission;
 * surfaces the missing pair in the error message for easier debugging.
 */
export function withPermission(resource: Resource, action: Action) {
  return tenantProcedure.use(({ ctx, next }) => {
    if (!hasPermission(ctx.role, resource, action)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `role ${ctx.role} cannot ${action} ${resource}`,
      });
    }
    return next({ ctx });
  });
}
