import { router } from './index.js';
import { agentsRouter } from './routers/agents.js';
import { apiKeysRouter } from './routers/api-keys.js';
import { auditRouter } from './routers/audit.js';
import { authRouter } from './routers/auth.js';
import { billingRouter } from './routers/billing.js';
import { chainApprovalsRouter } from './routers/chain-approvals.js';
import { cloudConnectionsRouter } from './routers/cloud-connections.js';
import { customersRouter } from './routers/customers.js';
import { edgeRouter } from './routers/edge.js';
import { envelopesRouter } from './routers/envelopes.js';
import { grantsRouter } from './routers/grants.js';
import { invitesRouter } from './routers/invites.js';
import { membersRouter } from './routers/members.js';
import { notificationPreferencesRouter } from './routers/notification-preferences.js';
import { oauthRouter } from './routers/oauth.js';
import { observabilityRouter } from './routers/observability.js';
import { organizationsRouter } from './routers/organizations.js';
import { policiesRouter } from './routers/policies.js';
import { schemasRouter } from './routers/schemas.js';
import { stepupRouter } from './routers/stepup.js';
import { swarmsRouter } from './routers/swarms.js';
import { ucansRouter } from './routers/ucans.js';

export const appRouter = router({
  auth: authRouter,
  customers: customersRouter,
  agents: agentsRouter,
  apiKeys: apiKeysRouter,
  policies: policiesRouter,
  schemas: schemasRouter,
  ucans: ucansRouter,
  audit: auditRouter,
  billing: billingRouter,
  stepup: stepupRouter,
  oauth: oauthRouter,
  cloudConnections: cloudConnectionsRouter,
  edge: edgeRouter,
  envelopes: envelopesRouter,
  grants: grantsRouter,
  notificationPreferences: notificationPreferencesRouter,
  swarms: swarmsRouter,
  chainApprovals: chainApprovalsRouter,
  observability: observabilityRouter,
  members: membersRouter,
  invites: invitesRouter,
  organizations: organizationsRouter,
});

export type AppRouter = typeof appRouter;
