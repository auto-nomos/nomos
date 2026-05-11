import { router } from './index.js';
import { agentsRouter } from './routers/agents.js';
import { apiKeysRouter } from './routers/api-keys.js';
import { auditRouter } from './routers/audit.js';
import { customersRouter } from './routers/customers.js';
import { envelopesRouter } from './routers/envelopes.js';
import { notificationPreferencesRouter } from './routers/notification-preferences.js';
import { oauthRouter } from './routers/oauth.js';
import { policiesRouter } from './routers/policies.js';
import { schemasRouter } from './routers/schemas.js';
import { stepupRouter } from './routers/stepup.js';
import { ucansRouter } from './routers/ucans.js';

export const appRouter = router({
  customers: customersRouter,
  agents: agentsRouter,
  apiKeys: apiKeysRouter,
  policies: policiesRouter,
  schemas: schemasRouter,
  ucans: ucansRouter,
  audit: auditRouter,
  stepup: stepupRouter,
  oauth: oauthRouter,
  envelopes: envelopesRouter,
  notificationPreferences: notificationPreferencesRouter,
});

export type AppRouter = typeof appRouter;
