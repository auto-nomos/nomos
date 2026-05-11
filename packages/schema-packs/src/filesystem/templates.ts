import type { PolicyTemplate } from '../types.js';

export const READS = ['/filesystem/read', '/filesystem/list'] as const;

export const actions = [...READS] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');

/**
 * Filesystem templates do not narrow paths inside Cedar — Cedar's `like`
 * operator only accepts a literal pattern, and our `path_prefix` is
 * issuer-vouched on the UCAN, not policy-time. The PDP enforces path
 * narrowing in two places: the pre-Cedar constraint gate
 * (`packages/core/src/decide.ts`) and the data-plane filesystem adapter
 * (`apps/pdp/src/adapters/filesystem.ts`). Cedar's job here is the
 * orthogonal axes: time of day, host pin, tenant, role.
 */
export const templates: PolicyTemplate[] = [
  {
    id: 'filesystem:dynamic-scoped-read',
    integrationId: 'filesystem',
    name: 'Dynamic-scoped read',
    description:
      'Allow filesystem reads. Path narrowing is enforced by the issuer-vouched UCAN constraint set via /v1/intent.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'filesystem:business-hours-read',
    integrationId: 'filesystem',
    name: 'Read during business hours',
    description: 'Allow reads only between 09:00 and 17:00 UTC.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };`,
    visualReady: true,
  },
  {
    id: 'filesystem:list-only',
    integrationId: 'filesystem',
    name: 'List-only',
    description: 'Permit listing entries but never reading file bytes.',
    cedarText: `permit (\n  principal,\n  action == Action::"/filesystem/list",\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'filesystem:host-pinned-read',
    integrationId: 'filesystem',
    name: 'Host-pinned read',
    description:
      'Allow reads only when the constraint pins a known host. Use to confine an agent to a single laptop or workstation.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.resource_constraint.host == "primary-laptop" };`,
    visualReady: true,
  },
  {
    id: 'filesystem:department-scoped-read',
    integrationId: 'filesystem',
    name: 'Department-scoped read',
    description:
      'Allow reads only when the issuer-vouched user.department context hint matches finance.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.user.department == "finance" };`,
    visualReady: true,
  },
];
