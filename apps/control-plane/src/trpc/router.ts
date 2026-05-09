import { router } from './index.js';
import { agentsRouter } from './routers/agents.js';
import { apiKeysRouter } from './routers/api-keys.js';
import { auditRouter } from './routers/audit.js';
import { customersRouter } from './routers/customers.js';
import { policiesRouter } from './routers/policies.js';
import { schemasRouter } from './routers/schemas.js';
import { ucansRouter } from './routers/ucans.js';

export const appRouter = router({
  customers: customersRouter,
  agents: agentsRouter,
  apiKeys: apiKeysRouter,
  policies: policiesRouter,
  schemas: schemasRouter,
  ucans: ucansRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
