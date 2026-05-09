import { actionsFor, PACKS } from '@credential-broker/schema-packs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, tenantProcedure } from '../index.js';

const SUPPORTED_INTEGRATIONS = ['github', 'slack', 'google', 'notion'] as const;

export const schemasRouter = router({
  list: tenantProcedure.query(() =>
    PACKS.map((p) => ({
      id: `${p.id}@v1`,
      version: 'v1',
      integrationId: p.id,
      name: p.name,
    })),
  ),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const idMatch = input.id.match(/^([a-z]+)@/);
    const pack = idMatch ? PACKS.find((p) => p.id === idMatch[1]) : undefined;
    if (!pack) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `schema ${input.id} not found` });
    }
    return { id: input.id, version: 'v1', integrationId: pack.id, name: pack.name };
  }),

  /**
   * Canonical command list for an integration (e.g. github → /github/repo/read,
   * /github/issue/create, …). Source of truth for both the dashboard's policy
   * Test panel and the visual builder's action node dropdowns.
   */
  actionsFor: tenantProcedure
    .input(z.object({ integrationId: z.enum(SUPPORTED_INTEGRATIONS) }))
    .query(({ input }) => {
      return actionsFor(input.integrationId).map((command) => ({ command }));
    }),
});
