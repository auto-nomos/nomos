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
  if (parent.provider === 'azure' && child.provider === 'azure') {
    if (parent.tenant_id !== undefined && child.tenant_id !== parent.tenant_id) return false;
    if (parent.subscription_id !== undefined && child.subscription_id !== parent.subscription_id)
      return false;
    if (parent.resource_group !== undefined && child.resource_group !== parent.resource_group)
      return false;
    if (parent.resource_type !== undefined && child.resource_type !== parent.resource_type)
      return false;
    if (parent.name !== undefined && child.name !== parent.name) return false;
    return true;
  }
  if (parent.provider === 'aws' && child.provider === 'aws') {
    if (parent.account_id !== undefined && child.account_id !== parent.account_id) return false;
    if (parent.region !== undefined && child.region !== parent.region) return false;
    if (parent.service !== undefined && child.service !== parent.service) return false;
    if (parent.arn !== undefined && child.arn !== parent.arn) return false;
    return true;
  }
  if (parent.provider === 'gcp' && child.provider === 'gcp') {
    if (parent.project_id !== undefined && child.project_id !== parent.project_id) return false;
    if (parent.location !== undefined && child.location !== parent.location) return false;
    if (parent.service !== undefined && child.service !== parent.service) return false;
    if (parent.resource_id !== undefined && child.resource_id !== parent.resource_id) return false;
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
  if (constraint.provider === 'azure') {
    if (constraint.subscription_id !== undefined) {
      const v = resource.subscription_id;
      if (typeof v !== 'string' || v !== constraint.subscription_id) return false;
    }
    if (constraint.resource_group !== undefined) {
      const v = resource.resource_group;
      if (typeof v !== 'string' || v !== constraint.resource_group) return false;
    }
    if (constraint.resource_type !== undefined) {
      const v = resource.resource_type;
      if (typeof v !== 'string' || v !== constraint.resource_type) return false;
    }
    if (constraint.name !== undefined) {
      const v = resource.name;
      if (typeof v !== 'string' || v !== constraint.name) return false;
    }
    return true;
  }
  if (constraint.provider === 'aws') {
    if (constraint.account_id !== undefined) {
      const v = resource.account_id;
      if (typeof v !== 'string' || v !== constraint.account_id) return false;
    }
    if (constraint.region !== undefined) {
      const v = resource.region;
      if (typeof v !== 'string' || v !== constraint.region) return false;
    }
    if (constraint.service !== undefined) {
      const v = resource.service;
      if (typeof v !== 'string' || v !== constraint.service) return false;
    }
    if (constraint.arn !== undefined) {
      const v = resource.arn;
      if (typeof v !== 'string' || v !== constraint.arn) return false;
    }
    return true;
  }
  if (constraint.provider === 'gcp') {
    if (constraint.project_id !== undefined) {
      const v = resource.project_id;
      if (typeof v !== 'string' || v !== constraint.project_id) return false;
    }
    if (constraint.location !== undefined) {
      const v = resource.location;
      if (typeof v !== 'string' || v !== constraint.location) return false;
    }
    if (constraint.service !== undefined) {
      const v = resource.service;
      if (typeof v !== 'string' || v !== constraint.service) return false;
    }
    if (constraint.resource_id !== undefined) {
      const v = resource.resource_id;
      if (typeof v !== 'string' || v !== constraint.resource_id) return false;
    }
    return true;
  }
  return false;
}
