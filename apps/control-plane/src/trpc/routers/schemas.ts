import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, tenantProcedure } from '../index.js';

/**
 * In-memory schema-pack registry. Sprint 10 replaces with the build artifact
 * from `packages/schema-packs/*`. For Sprint 3 we ship a single placeholder
 * so the dashboard's integration picker has something to show.
 */
const REGISTRY: Record<string, { id: string; version: string; name: string; description: string }> =
  {
    'github@v1': {
      id: 'github@v1',
      version: 'v1',
      name: 'GitHub',
      description: 'Issues, PRs, repos. Full implementation in Sprint 5.',
    },
  };

export const schemasRouter = router({
  list: tenantProcedure.query(() => Object.values(REGISTRY)),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const schema = REGISTRY[input.id];
    if (!schema) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `schema ${input.id} not found` });
    }
    return schema;
  }),
});
