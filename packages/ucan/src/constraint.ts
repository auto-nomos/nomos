import { ResourceConstraint } from '@auto-nomos/shared-types';

/**
 * Pull a `ResourceConstraint` out of a UCAN payload's `meta` field. Returns
 * undefined when none is present, throws on a present-but-malformed value
 * because that means the JWT was tampered or the issuer is buggy — either
 * way we must not silently treat a broken constraint as "no constraint".
 */
export function extractResourceConstraint(
  meta: Record<string, unknown> | undefined,
): ResourceConstraint | undefined {
  if (!meta) return undefined;
  const raw = meta.resource_constraint;
  if (raw === undefined || raw === null) return undefined;
  return ResourceConstraint.parse(raw);
}

/**
 * Subset check used both in chain attenuation (parent→child) and in the
 * PDP pre-Cedar gate (UCAN→request.resource). Returns true when `child`
 * stays inside `parent`. Cross-provider always returns false: a github
 * constraint cannot delegate filesystem access and vice versa.
 */
export function constraintCovers(parent: ResourceConstraint, child: ResourceConstraint): boolean {
  if (parent.provider !== child.provider) return false;
  if (parent.provider === 'filesystem' && child.provider === 'filesystem') {
    if (parent.host && child.host && parent.host !== child.host) return false;
    if (parent.host && !child.host) return false;
    return child.path_prefix.startsWith(parent.path_prefix);
  }
  if (parent.provider === 'github' && child.provider === 'github') {
    if (parent.owner !== child.owner) return false;
    if (parent.repo !== undefined && child.repo !== parent.repo) return false;
    if (parent.ref !== undefined && child.ref !== parent.ref) return false;
    if (parent.path_prefix !== undefined) {
      if (child.path_prefix === undefined) return false;
      if (!child.path_prefix.startsWith(parent.path_prefix)) return false;
    }
    if (parent.issue_number !== undefined && child.issue_number !== parent.issue_number) {
      return false;
    }
    if (parent.pr_number !== undefined && child.pr_number !== parent.pr_number) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Resource-shape gate used at the PDP. The agent's `request.resource` claim
 * is matched against the issuer-vouched constraint. Mirrors
 * `constraintCovers` on a free-form resource object.
 */
export function constraintMatchesResource(
  constraint: ResourceConstraint,
  resource: Record<string, unknown>,
): boolean {
  if (constraint.provider === 'filesystem') {
    const path = resource.path;
    if (typeof path !== 'string') return false;
    if (constraint.host) {
      const host = resource.host;
      if (typeof host !== 'string' || host !== constraint.host) return false;
    }
    return path.startsWith(constraint.path_prefix);
  }
  if (constraint.provider === 'github') {
    const owner = resource.owner;
    if (typeof owner !== 'string' || owner !== constraint.owner) return false;
    if (constraint.repo !== undefined) {
      const repo = resource.repo;
      if (typeof repo !== 'string' || repo !== constraint.repo) return false;
    }
    if (constraint.ref !== undefined) {
      const ref = resource.ref;
      if (typeof ref !== 'string' || ref !== constraint.ref) return false;
    }
    if (constraint.issue_number !== undefined) {
      if (resource.issue_number !== constraint.issue_number) return false;
    }
    if (constraint.pr_number !== undefined) {
      if (resource.pr_number !== constraint.pr_number) return false;
    }
    if (constraint.path_prefix !== undefined) {
      const path = resource.path;
      if (typeof path !== 'string' || !path.startsWith(constraint.path_prefix)) return false;
    }
    return true;
  }
  return false;
}
