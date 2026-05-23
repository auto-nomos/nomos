/**
 * Data for /vs/[competitor] dynamic pages and the home Comparison band.
 * Each entry generates one comparison page + one row in the home truth table.
 */

export type ComparisonId = 'auth0' | 'vault' | 'permit-io' | 'raw-oauth';

export interface FeatureRow {
  feature: string;
  nomos: boolean | string;
  competitor: boolean | string;
  note?: string;
}

export interface Comparison {
  id: ComparisonId;
  name: string;
  category: string;
  heroClaim: string;
  heroSub: string;
  oneLine: string;
  rows: FeatureRow[];
  faq: { q: string; a: string }[];
}

const SHARED_ROWS = (competitor: {
  caps: Partial<Record<string, boolean | string>>;
}): FeatureRow[] => [
  {
    feature: 'Capability tokens (UCAN)',
    nomos: true,
    competitor: competitor.caps.capabilityTokens ?? false,
  },
  {
    feature: 'Per-call policy decision',
    nomos: true,
    competitor: competitor.caps.perCallPolicy ?? false,
  },
  {
    feature: 'Cryptographic audit chain',
    nomos: true,
    competitor: competitor.caps.auditChain ?? false,
  },
  { feature: 'MCP-native server', nomos: true, competitor: competitor.caps.mcpNative ?? false },
  { feature: 'Self-hostable', nomos: 'soon', competitor: competitor.caps.selfHost ?? false },
  { feature: 'Open source', nomos: 'soon', competitor: competitor.caps.openSource ?? false },
  { feature: 'Step-up passkey approval', nomos: true, competitor: competitor.caps.stepUp ?? false },
  {
    feature: 'Schema-validated tool calls',
    nomos: true,
    competitor: competitor.caps.schemaValidated ?? false,
  },
  {
    feature: 'Multi-agent UCAN delegation',
    nomos: true,
    competitor: competitor.caps.delegation ?? false,
  },
  { feature: 'Multi-tenant org RBAC', nomos: true, competitor: competitor.caps.rbac ?? false },
];

export const COMPARISONS: Record<ComparisonId, Comparison> = {
  auth0: {
    id: 'auth0',
    name: 'Auth0',
    category: 'Identity provider',
    heroClaim: 'Auth0 logs in users. Nomos authorizes agents.',
    heroSub:
      'Auth0 issues sessions for humans. Nomos issues capability tokens for AI agents — every tool call gated, every action witnessed, no long-lived secrets on the agent.',
    oneLine:
      'Different problem. Auth0 sits in front of the user, Nomos sits between the agent and its tools.',
    rows: SHARED_ROWS({
      caps: {
        rbac: true,
        selfHost: 'enterprise',
      },
    }),
    faq: [
      {
        q: 'Can I use Auth0 with Nomos?',
        a: 'Yes — Auth0 signs your operators into the Nomos dashboard, Nomos signs your agents into your downstream tools. Different layer, no overlap.',
      },
      {
        q: 'Why not just give the agent an Auth0 M2M token?',
        a: 'M2M tokens are bearer secrets with broad audience. A leaked M2M token in a model trace is a long-lived breach. Nomos issues a UCAN scoped to one resource, one action, with seconds of lifetime.',
      },
    ],
  },
  vault: {
    id: 'vault',
    name: 'HashiCorp Vault',
    category: 'Secrets manager',
    heroClaim: 'Vault stores secrets. Nomos avoids them.',
    heroSub:
      'Vault hands the agent a key. Nomos hands the agent a decision. If the call is allowed, Nomos performs it for the agent and the credential never leaves our process.',
    oneLine: 'Vault gives your agent a secret. Nomos refuses to.',
    rows: SHARED_ROWS({
      caps: {
        selfHost: true,
        openSource: true,
        auditChain: 'logs',
        rbac: true,
      },
    }),
    faq: [
      {
        q: "Vault has dynamic secrets — isn't that enough?",
        a: 'Dynamic secrets shrink the blast radius, but the secret still lands on the agent. Nomos never sends one. The agent receives the result of the call, not the credential used to make it.',
      },
      {
        q: 'Can I keep using Vault?',
        a: "Yes. Vault is fine for human-operated services. Nomos is for agents — the ones you can't trust not to print their environment.",
      },
    ],
  },
  'permit-io': {
    id: 'permit-io',
    name: 'Permit.io',
    category: 'Authorization service',
    heroClaim: 'Permit.io decides. Nomos decides and acts.',
    heroSub:
      'Permit.io tells your app yes or no. Nomos tells your agent yes or no, then proxies the SaaS or cloud call with a short-lived credential — so the answer is also the action.',
    oneLine:
      'Permit.io is policy-as-a-service. Nomos is policy + credential + audit + execution, fused.',
    rows: SHARED_ROWS({
      caps: {
        perCallPolicy: true,
        rbac: true,
        openSource: 'OPAL',
      },
    }),
    faq: [
      {
        q: "Permit.io also uses Cedar / OPA. What's different?",
        a: 'Policy is one piece. Nomos also mints the credential, executes the call, schema-validates the payload, signs the audit, and chains it. Permit.io stops at the decision.',
      },
      {
        q: 'Can Nomos replace my existing authorization layer?',
        a: "For agents, yes. For your human-facing app, keep Permit.io or Cerbos — they're great at it. Nomos is purpose-built for the agent's side of the boundary.",
      },
    ],
  },
  'raw-oauth': {
    id: 'raw-oauth',
    name: 'Raw OAuth tokens',
    category: 'No broker',
    heroClaim: 'A token in a prompt is a token in a screenshot.',
    heroSub:
      "Putting an OAuth token in the agent's context window means it ends up in traces, logs, training sets, and the screenshot someone shares in Slack. Nomos issues a one-shot capability instead.",
    oneLine: 'The default everyone starts with. The default no one keeps.',
    rows: SHARED_ROWS({
      caps: {},
    }),
    faq: [
      {
        q: 'But the token is short-lived…',
        a: 'Short-lived means minutes-to-hours. A leaked screenshot, an OTel span, a model cache replay — all faster than rotation.',
      },
      {
        q: 'Is this just a proxy?',
        a: 'A proxy that mints UCANs, evaluates Cedar policy, signs an audit chain, validates the request schema, and offers step-up passkey approval. So: yes, the way a kitchen is just a stove.',
      },
    ],
  },
};

export const COMPARISON_IDS = Object.keys(COMPARISONS) as ComparisonId[];
