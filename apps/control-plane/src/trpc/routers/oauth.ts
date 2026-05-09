import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

export const oauthRouter = router({
  /** List the customer's OAuth connections (no tokens — metadata only). */
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.oauthConnections.findMany({
      where: eq(schema.oauthConnections.customerId, ctx.customerId),
      columns: {
        id: true,
        connector: true,
        accountId: true,
        scopesGranted: true,
        createdAt: true,
      },
    });
    return rows;
  }),
});
