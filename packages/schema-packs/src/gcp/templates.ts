import type { PolicyTemplate } from '../types.js';
import { DESTRUCTIVE, OPS, RAW_CALL, READS } from './actions.js';

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const OPS_LIST = OPS.map((a) => `Action::"${a}"`).join(', ');
const DESTRUCTIVE_LIST = DESTRUCTIVE.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'gcp:read-only',
    integrationId: 'gcp',
    name: 'GCP read-only',
    description: 'Allows listing and reading GCP resources. No writes, no destructive actions.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'gcp:safe-default',
    integrationId: 'gcp',
    name: 'GCP safe default',
    description:
      'Reads always; ops actions only with cosigner; destructive deletes always forbidden.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${OPS_LIST}],\n  resource\n)\nwhen { context.cosigner == true };\n\nforbid (\n  principal,\n  action in [${DESTRUCTIVE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'gcp:read-scoped-to-project',
    integrationId: 'gcp',
    name: 'GCP read scoped to one project',
    description: 'Read-only access pinned to a single project_id.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.project_id == context.allowed_project_id };`,
    visualReady: false,
  },
  {
    id: 'gcp:business-hours-read',
    integrationId: 'gcp',
    name: 'GCP read only during business hours',
    description: 'Reads only between 09:00 and 17:00 UTC.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };`,
    visualReady: true,
  },
  {
    id: 'gcp:finops-billing',
    integrationId: 'gcp',
    name: 'GCP billing + inventory only',
    description: 'Just billing reads + monitoring metrics.',
    cedarText: `permit (\n  principal,\n  action in [Action::"/gcp/billing/cost_query", Action::"/gcp/compute/instances_list", Action::"/gcp/cloud_run/services_list", Action::"/gcp/monitoring/time_series"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'gcp:raw-call-readonly',
    integrationId: 'gcp',
    name: 'GCP raw_call read-only',
    description:
      'Escape hatch: GET to *.googleapis.com restricted by context.allowed_prefixes; first use cosigns.',
    cedarText: `permit (\n  principal,\n  action == Action::"${RAW_CALL}",\n  resource\n)\nwhen { resource.method == "GET" && resource.path_prefix in context.allowed_prefixes && context.cosigner == true };`,
    visualReady: false,
  },
];
