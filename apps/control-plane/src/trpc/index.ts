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
  if (!ctx.customerId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'no active customer membership',
    });
  }
  return next({ ctx: { ...ctx, customerId: ctx.customerId } });
});

export const protectedProcedure = t.procedure.use(requireSession);
export const tenantProcedure = t.procedure.use(requireMembership);
