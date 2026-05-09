/**
 * Authoritative data model for the credential-broker control plane.
 *
 * Phase 1 spec section 6 defines 13 application tables; we additionally maintain
 * 4 Better-Auth tables (user/session/account/verification) for sign-in. Total: 17.
 *
 * Better-Auth owns the user/session/account/verification tables. Application
 * tables (memberships, revocations.revoked_by, push_approvals.decided_by)
 * reference Better-Auth's user.id (uuid).
 */
import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ===== Enums =====

export const planEnum = pgEnum('plan', ['free', 'pro', 'enterprise']);
export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'member']);
export const agentStatusEnum = pgEnum('agent_status', ['active', 'disabled', 'deleted']);
export const oauthConnectorEnum = pgEnum('oauth_connector', [
  'github',
  'slack',
  'google',
  'notion',
  'salesforce',
  'linear',
  'stripe',
  'jira',
  'google_calendar',
  'postgres',
]);
export const auditDecisionEnum = pgEnum('audit_decision', ['allow', 'deny', 'stepup']);
export const pushApprovalStateEnum = pgEnum('push_approval_state', [
  'pending',
  'approved',
  'denied',
  'expired',
]);

// ===== Better-Auth tables (auth identity) =====

export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('user_email_idx').on(t.email),
  }),
);

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    tokenIdx: uniqueIndex('session_token_idx').on(t.token),
    userIdx: index('session_user_idx').on(t.userId),
  }),
);

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('account_user_idx').on(t.userId),
    providerIdx: index('account_provider_idx').on(t.providerId, t.accountId),
  }),
);

export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Application tables (per spec section 6) =====

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: planEnum('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCustomerIdx: uniqueIndex('memberships_user_customer_idx').on(t.userId, t.customerId),
    customerIdx: index('memberships_customer_idx').on(t.customerId),
  }),
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    did: text('did').notNull(),
    apiKeyHash: text('api_key_hash'),
    status: agentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  },
  (t) => ({
    customerIdx: index('agents_customer_idx').on(t.customerId),
    didIdx: uniqueIndex('agents_did_idx').on(t.did),
  }),
);

export const schemas = pgTable('schemas', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  definition: jsonb('definition').notNull(),
  schemaHash: text('schema_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthConnections = pgTable(
  'oauth_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    connector: oauthConnectorEnum('connector').notNull(),
    accountId: text('account_id').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    nonce: text('nonce').notNull(),
    scopesGranted: jsonb('scopes_granted').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('oauth_connections_customer_idx').on(t.customerId),
    customerConnectorIdx: index('oauth_connections_customer_connector_idx').on(
      t.customerId,
      t.connector,
    ),
  }),
);

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    integrationId: text('integration_id').references(() => schemas.id),
    name: text('name').notNull(),
    cedarText: text('cedar_text').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('policies_customer_idx').on(t.customerId),
  }),
);

export const ucanIssues = pgTable(
  'ucan_issues',
  {
    cid: text('cid').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull(),
    jwt: text('jwt').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    customerIdx: index('ucan_issues_customer_idx').on(t.customerId),
    agentIdx: index('ucan_issues_agent_idx').on(t.agentId),
  }),
);

export const revocations = pgTable(
  'revocations',
  {
    cid: text('cid')
      .primaryKey()
      .references(() => ucanIssues.cid, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid('revoked_by').references(() => user.id),
  },
  (t) => ({
    customerIdx: index('revocations_customer_idx').on(t.customerId),
  }),
);

export const auditEvents = pgTable(
  'audit_events',
  {
    eventId: uuid('event_id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    agent: text('agent').notNull(),
    decision: auditDecisionEnum('decision').notNull(),
    command: text('command').notNull(),
    resource: jsonb('resource').notNull(),
    context: jsonb('context'),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    customerTsIdx: index('audit_events_customer_ts_idx').on(t.customerId, t.ts),
    prevHashIdx: index('audit_events_prev_hash_idx').on(t.prevHash),
    hashIdx: uniqueIndex('audit_events_hash_idx').on(t.hash),
  }),
);

export const pushApprovals = pgTable(
  'push_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    command: text('command').notNull(),
    resource: jsonb('resource').notNull(),
    state: pushApprovalStateEnum('state').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => user.id),
    cosignerAttestationJwt: text('cosigner_attestation_jwt'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    customerIdx: index('push_approvals_customer_idx').on(t.customerId),
    stateIdx: index('push_approvals_state_idx').on(t.state),
  }),
);

export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    webhookUrl: text('webhook_url'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('mcp_servers_customer_idx').on(t.customerId),
  }),
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    customerIdx: index('api_keys_customer_idx').on(t.customerId),
    keyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(t.keyHash),
  }),
);

// ===== Relations =====

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  memberships: many(memberships),
  agents: many(agents),
  policies: many(policies),
  oauthConnections: many(oauthConnections),
  apiKeys: many(apiKeys),
  mcpServers: many(mcpServers),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(user, { fields: [memberships.userId], references: [user.id] }),
  customer: one(customers, { fields: [memberships.customerId], references: [customers.id] }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  customer: one(customers, { fields: [agents.customerId], references: [customers.id] }),
  ucanIssues: many(ucanIssues),
  apiKeys: many(apiKeys),
  pushApprovals: many(pushApprovals),
}));

export const policiesRelations = relations(policies, ({ one }) => ({
  customer: one(customers, { fields: [policies.customerId], references: [customers.id] }),
  schema: one(schemas, { fields: [policies.integrationId], references: [schemas.id] }),
}));

export const ucanIssuesRelations = relations(ucanIssues, ({ one }) => ({
  customer: one(customers, { fields: [ucanIssues.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [ucanIssues.agentId], references: [agents.id] }),
}));

export const revocationsRelations = relations(revocations, ({ one }) => ({
  ucanIssue: one(ucanIssues, { fields: [revocations.cid], references: [ucanIssues.cid] }),
  customer: one(customers, { fields: [revocations.customerId], references: [customers.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  customer: one(customers, { fields: [auditEvents.customerId], references: [customers.id] }),
}));

export const oauthConnectionsRelations = relations(oauthConnections, ({ one }) => ({
  customer: one(customers, { fields: [oauthConnections.customerId], references: [customers.id] }),
}));

export const pushApprovalsRelations = relations(pushApprovals, ({ one }) => ({
  customer: one(customers, { fields: [pushApprovals.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [pushApprovals.agentId], references: [agents.id] }),
}));

export const mcpServersRelations = relations(mcpServers, ({ one }) => ({
  customer: one(customers, { fields: [mcpServers.customerId], references: [customers.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  customer: one(customers, { fields: [apiKeys.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [apiKeys.agentId], references: [agents.id] }),
}));
