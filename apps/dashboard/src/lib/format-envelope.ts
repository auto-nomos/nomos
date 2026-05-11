/**
 * Provider-aware human text for an envelope spec. Used on the
 * approval page (what the user is being asked to permit) and on the
 * agent's "Active grants" panel (what currently exists).
 *
 * Kept in one file so adding a new provider only changes one switch.
 */
export type FilesystemConstraint = {
  provider: 'filesystem';
  path_prefix: string;
  host?: string;
};

export type GithubConstraint = {
  provider: 'github';
  owner: string;
  repo?: string;
  ref?: string;
  path_prefix?: string;
  issue_number?: number;
  pr_number?: number;
};

export type ResourceConstraint = FilesystemConstraint | GithubConstraint;

export interface EnvelopeSpec {
  constraint: ResourceConstraint;
  actions: string[];
  /** Omit or set null for standing (durable) grants. */
  ttlSeconds?: number | null;
  reason?: string;
}

export function formatScope(constraint: ResourceConstraint): string {
  if (constraint.provider === 'filesystem') {
    return constraint.host
      ? `${constraint.host}:${constraint.path_prefix}`
      : constraint.path_prefix;
  }
  if (constraint.provider === 'github') {
    const target = [constraint.owner, constraint.repo].filter(Boolean).join('/');
    const subject = constraint.pr_number
      ? `${target}#${constraint.pr_number}`
      : constraint.issue_number
        ? `${target} issue ${constraint.issue_number}`
        : constraint.path_prefix
          ? `${target}/${constraint.path_prefix}`
          : target;
    return constraint.ref ? `${subject}@${constraint.ref}` : subject;
  }
  // Future providers fall through to JSON for safety; the dashboard
  // still renders something rather than blowing up the page.
  return JSON.stringify(constraint);
}

export function formatProvider(constraint: ResourceConstraint): string {
  return constraint.provider === 'filesystem' ? 'filesystem' : constraint.provider;
}

export function formatEnvelopeAsk(spec: EnvelopeSpec): string {
  const actions = spec.actions.join(' + ');
  const scope = formatScope(spec.constraint);
  const provider = formatProvider(spec.constraint);
  const lifetime =
    spec.ttlSeconds === null || spec.ttlSeconds === undefined
      ? 'until revoked'
      : `for ${spec.ttlSeconds}s`;
  return `Allow ${actions} on ${provider} ${scope} ${lifetime}`;
}

export const REASON_LABELS: Record<string, string> = {
  no_covering_envelope: 'No active grant covers this — first time access',
  sensitive_path: 'Sensitive path — always re-confirms',
  high_risk_action: 'High-risk action — always re-confirms',
  org_admin_action: 'Org-wide write — always re-confirms',
  coherence_mismatch: 'Request does not match declared purpose',
};

export function formatReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  return REASON_LABELS[reason] ?? reason;
}
