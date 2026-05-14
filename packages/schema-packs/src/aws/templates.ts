import type { PolicyTemplate } from '../types.js';
import { DESTRUCTIVE, OPS, RAW_CALL, READS } from './actions.js';

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const OPS_LIST = OPS.map((a) => `Action::"${a}"`).join(', ');
const DESTRUCTIVE_LIST = DESTRUCTIVE.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'aws:read-only',
    integrationId: 'aws',
    name: 'AWS read-only',
    description: 'Allows listing and reading AWS resources. No writes, no destructive actions.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'aws:safe-default',
    integrationId: 'aws',
    name: 'AWS safe default',
    description:
      'Reads always; ops actions only with cosigner; destructive deletes always forbidden.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${OPS_LIST}],\n  resource\n)\nwhen { context.cosigner == true };\n\nforbid (\n  principal,\n  action in [${DESTRUCTIVE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'aws:read-scoped-to-account',
    integrationId: 'aws',
    name: 'AWS read scoped to one account',
    description: 'Read-only access pinned to a single AWS account_id.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.account_id == context.allowed_account_id };`,
    visualReady: false,
  },
  {
    id: 'aws:read-scoped-to-region',
    integrationId: 'aws',
    name: 'AWS read scoped to one region',
    description: 'Reads restricted to a single region.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.region == context.allowed_region };`,
    visualReady: false,
  },
  {
    id: 'aws:finops-cost-explorer',
    integrationId: 'aws',
    name: 'AWS Cost Explorer only',
    description: 'Just billing reads — Cost Explorer + read-only inventory.',
    cedarText: `permit (\n  principal,\n  action in [Action::"/aws/ce/get_cost_and_usage", Action::"/aws/ec2/list_instances", Action::"/aws/lambda/list", Action::"/aws/cloudwatch/get_metric"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'aws:raw-call-readonly',
    integrationId: 'aws',
    name: 'AWS raw_call read-only',
    description:
      'Escape hatch: GET to a *.amazonaws.com host restricted by context.allowed_prefixes; first use cosigns.',
    cedarText: `permit (\n  principal,\n  action == Action::"${RAW_CALL}",\n  resource\n)\nwhen { resource.method == "GET" && resource.path_prefix in context.allowed_prefixes && context.cosigner == true };`,
    visualReady: false,
  },
];
