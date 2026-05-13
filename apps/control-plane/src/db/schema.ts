/**
 * Authoritative data model for the credential-broker control plane.
 *
 * Phase 1 spec section 6 defines 13 application tables; Sprint 8 added
 * audit_roots; Sprint 9 adds webauthn_credentials. Plus 4 Better-Auth
 * tables (user/session/account/verification) for sign-in. Total: 19.
 *
 * Better-Auth owns the user/session/account/verification tables. Application
 * tables (memberships, revocations.revoked_by, push_approvals.decided_by)
 * reference Better-Auth's user.id (uuid).
 */
import { relations, sql } from 'drizzle-orm';
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
export const agentModeEnum = pgEnum('agent_mode', ['static', 'dynamic']);
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
  // P1 / M3 — new YAML-driven adapters
  'google_gmail',
  'google_drive',
  'google_contacts',
  'discord',
  'telegram',
  'dropbox',
  'twilio',
  'granola',
  'perplexity',
  'imessage',
]);
export const auditDecisionEnum = pgEnum('audit_decision', ['allow', 'deny', 'stepup']);
export const pushApprovalStateEnum = pgEnum('push_approval_state', [
  'pending',
  'approved',
  'denied',
  'expired',
]);
export const grantDecisionEnum = pgEnum('grant_decision', ['allow', 'deny']);
export const grantScopeEnum = pgEnum('grant_scope', ['exact', 'any']);
export const riskScoreEnum = pgEnum('risk_score', ['low', 'medium', 'high']);
export const agentPoliciesSourceEnum = pgEnum('agent_policies_source', ['manual', 'step_up']);

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
    // Set on first successful passkey enrollment. Middleware gates `/app/*`
    // on this being non-null so a grace-period password sign-in lands on
    // `/onboarding/enroll-passkey` until the user actually enrolls.
    passkeyEnrolledAt: timestamp('passkey_enrolled_at', { withTimezone: true }),
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

/**
 * Sprint MAOS-A — `swarms` groups agents that participate in delegation chains.
 * One swarm is rooted at a single agent (`rootAgentId`); children are linked
 * via `agents.parentAgentId`. `crossCustomerEnabled` is a reserved design
 * hook for Phase 2 federation; enforcement stays intra-customer at launch.
 */
export const swarms = pgTable(
  'swarms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootAgentId: uuid('root_agent_id'),
    maxDepth: integer('max_depth'),
    crossCustomerEnabled: boolean('cross_customer_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('swarms_customer_idx').on(t.customerId),
    rootAgentIdx: index('swarms_root_agent_idx').on(t.rootAgentId),
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
    mode: agentModeEnum('mode').notNull().default('static'),
    stepUpOnDeny: boolean('step_up_on_deny').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    connectionApprovedAt: timestamp('connection_approved_at', { withTimezone: true }),
    connectionApprovedBy: uuid('connection_approved_by'),
    /**
     * Sprint MAOS-A — chain identity. Nullable for legacy single-agent rows.
     * `rootAgentId` self-references when this agent is the swarm root.
     * `depth` is 0 for root; children increment by 1.
     */
    parentAgentId: uuid('parent_agent_id'),
    rootAgentId: uuid('root_agent_id'),
    depth: integer('depth').notNull().default(0),
    swarmId: uuid('swarm_id').references(() => swarms.id, { onDelete: 'set null' }),
  },
  (t) => ({
    customerIdx: index('agents_customer_idx').on(t.customerId),
    didIdx: uniqueIndex('agents_did_idx').on(t.did),
    parentIdx: index('agents_parent_idx').on(t.parentAgentId),
    rootIdx: index('agents_root_idx').on(t.rootAgentId),
    swarmIdx: index('agents_swarm_idx').on(t.swarmId),
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
    refreshTokenNonce: text('nonce').notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    encryptedAccessToken: text('encrypted_access_token'),
    accessTokenNonce: text('access_token_nonce'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
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
    /**
     * Sprint MAOS-A — chain causation. `parentReceiptId` back-links the
     * authorize-receipt that triggered this call (orthogonal to prevHash,
     * which links the tamper-evidence chain). Nullable for root receipts.
     */
    parentReceiptId: uuid('parent_receipt_id'),
    swarmId: uuid('swarm_id'),
    chainDepth: integer('chain_depth'),
  },
  (t) => ({
    customerTsIdx: index('audit_events_customer_ts_idx').on(t.customerId, t.ts),
    prevHashIdx: index('audit_events_prev_hash_idx').on(t.prevHash),
    hashIdx: uniqueIndex('audit_events_hash_idx').on(t.hash),
    parentReceiptIdx: index('audit_events_parent_receipt_idx').on(t.parentReceiptId),
    swarmIdx: index('audit_events_swarm_idx').on(t.swarmId),
  }),
);

/**
 * Sprint 8.3 (D-4) — daily root signatures over the audit hash chain.
 * One row per (customer_id, signing run). `root_event_id` points at the
 * audit_events row whose hash was anchored; `signature` is the Ed25519
 * signature of `root_hash` by the env-managed audit signing key.
 */
export const auditRoots = pgTable(
  'audit_roots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rootEventId: uuid('root_event_id')
      .notNull()
      .references(() => auditEvents.eventId, { onDelete: 'restrict' }),
    rootHash: text('root_hash').notNull(),
    /** Stable identifier for the signing key (`did:key:...` or env handle). */
    signingKeyId: text('signing_key_id').notNull(),
    /** Hex-encoded Ed25519 signature over root_hash. */
    signature: text('signature').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerSignedAtIdx: index('audit_roots_customer_signed_at_idx').on(t.customerId, t.signedAt),
    rootEventIdx: uniqueIndex('audit_roots_root_event_idx').on(t.rootEventId),
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
    /**
     * Sprint 9 — CID of the original UCAN that triggered the step-up. The
     * cosigner UCAN's `meta.cosigner_for` is this value; the PDP refuses
     * any cosigner whose `cosigner_for` doesn't match the request's UCAN.
     */
    originalUcanCid: text('original_ucan_cid'),
    riskScore: riskScoreEnum('risk_score'),
    riskSummary: text('risk_summary'),
    cedarPreview: text('cedar_preview'),
    /**
     * Three LLM-drafted Cedar policy variants (narrow / medium / broad scope).
     * Operator picks one in the dashboard /approve/:id flow; the chosen
     * variant persists verbatim into `agent_grants.cedar_snippet`. Older
     * rows (pre-P2) may have null here — the dashboard falls back to
     * `cedar_preview`.
     */
    cedarVariants: jsonb('cedar_variants'),
    recommendedScope: text('recommended_scope'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resourceHash: text('resource_hash').notNull().default(''),
  },
  (t) => ({
    customerIdx: index('push_approvals_customer_idx').on(t.customerId),
    stateIdx: index('push_approvals_state_idx').on(t.state),
    pendingDedupIdx: uniqueIndex('push_approvals_pending_dedup_idx')
      .on(t.customerId, t.agentId, t.command, t.resourceHash)
      .where(sql`state = 'pending'`),
  }),
);

export const agentGrants = pgTable(
  'agent_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    command: text('command').notNull(),
    resourcePattern: jsonb('resource_pattern')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    scope: grantScopeEnum('scope').notNull().default('exact'),
    decision: grantDecisionEnum('decision').notNull(),
    cedarSnippet: text('cedar_snippet'),
    riskSummary: text('risk_summary'),
    sourceApprovalId: uuid('source_approval_id').references(() => pushApprovals.id, {
      onDelete: 'set null',
    }),
    grantedBy: uuid('granted_by').references(() => user.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => user.id),
  },
  (t) => ({
    customerAgentIdx: index('agent_grants_customer_agent_idx').on(t.customerId, t.agentId),
    activeLookupIdx: index('agent_grants_lookup_idx').on(t.agentId, t.command),
  }),
);

/**
 * Policy↔App mapping. By design, an app (agent) starts with **zero**
 * mapped policies — that means deny everything. Operator must opt in by
 * mapping at least one policy on the dashboard. Dynamic apps still hit
 * deny on unmapped commands, which routes through the existing step-up
 * loop; on approval-with-policy the system inserts a `policies` row
 * plus an `agent_policies` row with `source = 'step_up'`.
 */
export const agentPolicies = pgTable(
  'agent_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id, { onDelete: 'cascade' }),
    source: agentPoliciesSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => user.id),
  },
  (t) => ({
    agentIdx: index('agent_policies_agent_idx').on(t.agentId),
    policyIdx: index('agent_policies_policy_idx').on(t.policyId),
    agentPolicyUq: uniqueIndex('agent_policies_agent_policy_uq').on(t.agentId, t.policyId),
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
    /** Last MCP client that used this key. Populated by api-key-auth
     *  middleware on each successful auth so the dashboard can show
     *  which Cursor / Claude-Code / Codex instance is paired. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUserAgent: text('last_user_agent'),
    lastHost: text('last_host'),
  },
  (t) => ({
    customerIdx: index('api_keys_customer_idx').on(t.customerId),
    keyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(t.keyHash),
  }),
);

/**
 * Sprint 9 (legacy) — step-up only WebAuthn credentials. Superseded by the
 * `passkey` table below which is shared by Better-Auth login enrollment AND
 * step-up assertion. Backfilled into `passkey` by migration 0019; kept here
 * for one release cycle in case rollback is needed, then dropped.
 */
export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports'),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('webauthn_credentials_user_idx').on(t.userId),
    credentialIdIdx: uniqueIndex('webauthn_credentials_credential_id_idx').on(t.credentialId),
  }),
);

/**
 * Passkey credentials managed by Better-Auth's `passkey` plugin. One source
 * of truth for both login (sign-in / sign-up) and step-up assertion. Field
 * names follow Better-Auth's plugin schema (camelCase in TS → snake_case
 * columns); the Drizzle adapter binding in `auth/index.ts` exposes this
 * table to the plugin under the key `passkey`.
 */
export const passkey = pgTable(
  'passkey',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type').notNull().default('singleDevice'),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('passkey_user_idx').on(t.userId),
    credentialIdIdx: uniqueIndex('passkey_credential_id_idx').on(t.credentialID),
  }),
);

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));

/**
 * Approval Envelope — passkey-cosigned grant that bounds the resource
 * scope of subsequent dynamic UCAN mints for an agent. The /v1/intent
 * endpoint mints child UCANs whose `meta.resource_constraint` is a
 * subset of `constraint`. Revoked envelopes are pushed to the PDP via
 * the existing Sprint 8 revocation channel.
 */
export const envelopes = pgTable(
  'envelopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    constraint: jsonb('constraint').notNull(),
    actions: jsonb('actions').$type<string[]>().notNull(),
    parentUcanCid: text('parent_ucan_cid').references(() => ucanIssues.cid),
    createdBy: uuid('created_by').references(() => user.id),
    /** Null when the envelope is *standing* (durable until revoked).
     *  Otherwise the TTL boundary set at creation. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** True for durable grants ("always allow this agent to read X").
     *  Standing envelopes always require step-up + cosigner to create
     *  and never silently mint without explicit approval. */
    isStanding: boolean('is_standing').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerAgentIdx: index('envelopes_customer_agent_idx').on(t.customerId, t.agentId),
    expiresIdx: index('envelopes_expires_idx').on(t.expiresAt),
    standingIdx: index('envelopes_standing_idx').on(t.customerId, t.agentId, t.isStanding),
  }),
);

/**
 * Per-user notification preferences (P-CV4 — Telegram channel parity).
 * Drives step-up notifier channel selection. Web push + email default
 * to on; Telegram is opt-in and requires the user to provide their
 * chat id from the credential-broker bot.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  telegramChatId: text('telegram_chat_id'),
  telegramEnabled: boolean('telegram_enabled').notNull().default(false),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  webPushEnabled: boolean('web_push_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Relations =====

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(session),
  accounts: many(account),
  webauthnCredentials: many(webauthnCredentials),
  passkeys: many(passkey),
}));

export const webauthnCredentialsRelations = relations(webauthnCredentials, ({ one }) => ({
  user: one(user, { fields: [webauthnCredentials.userId], references: [user.id] }),
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
  agentPolicies: many(agentPolicies),
  swarm: one(swarms, { fields: [agents.swarmId], references: [swarms.id] }),
}));

export const swarmsRelations = relations(swarms, ({ one, many }) => ({
  customer: one(customers, { fields: [swarms.customerId], references: [customers.id] }),
  agents: many(agents),
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  customer: one(customers, { fields: [policies.customerId], references: [customers.id] }),
  schema: one(schemas, { fields: [policies.integrationId], references: [schemas.id] }),
  agentPolicies: many(agentPolicies),
}));

export const agentPoliciesRelations = relations(agentPolicies, ({ one }) => ({
  customer: one(customers, { fields: [agentPolicies.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [agentPolicies.agentId], references: [agents.id] }),
  policy: one(policies, { fields: [agentPolicies.policyId], references: [policies.id] }),
  createdByUser: one(user, { fields: [agentPolicies.createdBy], references: [user.id] }),
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

export const auditRootsRelations = relations(auditRoots, ({ one }) => ({
  customer: one(customers, { fields: [auditRoots.customerId], references: [customers.id] }),
  rootEvent: one(auditEvents, {
    fields: [auditRoots.rootEventId],
    references: [auditEvents.eventId],
  }),
}));

export const oauthConnectionsRelations = relations(oauthConnections, ({ one }) => ({
  customer: one(customers, { fields: [oauthConnections.customerId], references: [customers.id] }),
}));

export const pushApprovalsRelations = relations(pushApprovals, ({ one }) => ({
  customer: one(customers, { fields: [pushApprovals.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [pushApprovals.agentId], references: [agents.id] }),
}));

export const agentGrantsRelations = relations(agentGrants, ({ one }) => ({
  customer: one(customers, { fields: [agentGrants.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [agentGrants.agentId], references: [agents.id] }),
  sourceApproval: one(pushApprovals, {
    fields: [agentGrants.sourceApprovalId],
    references: [pushApprovals.id],
  }),
  grantedByUser: one(user, { fields: [agentGrants.grantedBy], references: [user.id] }),
  revokedByUser: one(user, { fields: [agentGrants.revokedBy], references: [user.id] }),
}));

export const mcpServersRelations = relations(mcpServers, ({ one }) => ({
  customer: one(customers, { fields: [mcpServers.customerId], references: [customers.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  customer: one(customers, { fields: [apiKeys.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [apiKeys.agentId], references: [agents.id] }),
}));

export const envelopesRelations = relations(envelopes, ({ one }) => ({
  customer: one(customers, { fields: [envelopes.customerId], references: [customers.id] }),
  agent: one(agents, { fields: [envelopes.agentId], references: [agents.id] }),
  createdByUser: one(user, { fields: [envelopes.createdBy], references: [user.id] }),
  parentUcan: one(ucanIssues, {
    fields: [envelopes.parentUcanCid],
    references: [ucanIssues.cid],
  }),
}));

// ===== M6: Telegram approval bot =====

export const customerTelegramLinks = pgTable(
  'customer_telegram_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /** Better-Auth user id who paired this chat. */
    userId: uuid('user_id').notNull(),
    /** Telegram chat id; numeric, but stored as text to avoid 64-bit issues. */
    chatId: text('chat_id').notNull(),
    /** Telegram username at link time (display only; may rotate). */
    username: text('username'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    customerChatUq: uniqueIndex('customer_telegram_links_customer_chat_uq').on(
      t.customerId,
      t.chatId,
    ),
    chatIdx: index('customer_telegram_links_chat_idx').on(t.chatId),
  }),
);

export const telegramLinkTokens = pgTable(
  'telegram_link_tokens',
  {
    token: text('token').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => ({
    customerIdx: index('telegram_link_tokens_customer_idx').on(t.customerId),
  }),
);

export const customerTelegramLinksRelations = relations(customerTelegramLinks, ({ one }) => ({
  customer: one(customers, {
    fields: [customerTelegramLinks.customerId],
    references: [customers.id],
  }),
}));

export const telegramLinkTokensRelations = relations(telegramLinkTokens, ({ one }) => ({
  customer: one(customers, {
    fields: [telegramLinkTokens.customerId],
    references: [customers.id],
  }),
}));

// ===== M7: chain-context LLM intent verification =====

export const chainContextFacts = pgTable(
  'chain_context_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /** Logical task identifier. Maps onto envelope or task lifecycle. */
    taskId: text('task_id').notNull(),
    /** Session identifier — typically the agent's interactive session. */
    sessionId: text('session_id').notNull(),
    /** Fact category — `id`, `email`, `address`, `amount`, `name`, `url`. */
    factType: text('fact_type').notNull(),
    /** Extracted value (kept short — sanitized + truncated upstream). */
    factValue: text('fact_value').notNull(),
    /**
     * UCAN CID (or other request id) of the response this fact was
     * extracted from — lets us audit + invalidate when revoked.
     */
    sourceRequestId: text('source_request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskSessionIdx: index('chain_context_facts_task_session_idx').on(
      t.customerId,
      t.taskId,
      t.sessionId,
      t.createdAt,
    ),
    typeIdx: index('chain_context_facts_type_idx').on(t.customerId, t.factType),
  }),
);

export const chainContextFactsRelations = relations(chainContextFacts, ({ one }) => ({
  customer: one(customers, {
    fields: [chainContextFacts.customerId],
    references: [customers.id],
  }),
}));

/**
 * Per-tenant monthly usage counters. The wedge plan meters mint-ucan
 * (every authorized agent request walks through CP mint) and proxy
 * calls (PDP /v1/proxy). One row per (customer_id, period_start)
 * keeps the math idempotent: incrementMint upserts on conflict.
 *
 * `period_start` is the first instant of the calendar month (UTC),
 * so the free-tier cap resets at month boundaries without a cron.
 * Stripe meter sync (deferred) reads this same row and posts deltas.
 */
export const usageCounters = pgTable(
  'usage_counters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    mintCount: integer('mint_count').notNull().default(0),
    proxyCount: integer('proxy_count').notNull().default(0),
    lastAt: timestamp('last_at', { withTimezone: true }).notNull().defaultNow(),
    stripeMeterPending: integer('stripe_meter_pending').notNull().default(0),
  },
  (t) => ({
    customerPeriodIdx: uniqueIndex('usage_counters_customer_period_idx').on(
      t.customerId,
      t.periodStart,
    ),
  }),
);

export const usageCountersRelations = relations(usageCounters, ({ one }) => ({
  customer: one(customers, {
    fields: [usageCounters.customerId],
    references: [customers.id],
  }),
}));

/**
 * Sprint MAOS-B — swarm-scoped step-up approvals.
 * `approvedAgentIds` is a *snapshot* of children at approval time. New
 * agents forked after approval need a fresh approval — never auto-extend.
 */
export const agentChainApprovals = pgTable(
  'agent_chain_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rootAgentId: uuid('root_agent_id').notNull(),
    swarmId: uuid('swarm_id'),
    scope: jsonb('scope').notNull(),
    approvedAgentIds: jsonb('approved_agent_ids').$type<string[]>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approverEmail: text('approver_email').notNull(),
    appliesToCurrentChildrenOnly: boolean('applies_to_current_children_only')
      .notNull()
      .default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('agent_chain_approvals_customer_idx').on(t.customerId),
    rootAgentIdx: index('agent_chain_approvals_root_agent_idx').on(t.rootAgentId),
    swarmIdx: index('agent_chain_approvals_swarm_idx').on(t.swarmId),
    expiresAtIdx: index('agent_chain_approvals_expires_at_idx').on(t.expiresAt),
  }),
);
