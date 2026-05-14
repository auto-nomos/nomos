import type { PolicyTemplate } from '../types.js';
import { DESTRUCTIVE, OPS, RAW_CALL, READS } from './actions.js';

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const OPS_LIST = OPS.map((a) => `Action::"${a}"`).join(', ');
const DESTRUCTIVE_LIST = DESTRUCTIVE.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'azure:read-only',
    integrationId: 'azure',
    name: 'Azure read-only',
    description: 'Allows listing and reading Azure resources. No writes, no destructive actions.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'azure:safe-default',
    integrationId: 'azure',
    name: 'Azure safe default',
    description:
      'Reads always; ops actions only with cosigner; destructive deletes always forbidden.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${OPS_LIST}],\n  resource\n)\nwhen { context.cosigner == true };\n\nforbid (\n  principal,\n  action in [${DESTRUCTIVE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'azure:read-scoped-to-subscription',
    integrationId: 'azure',
    name: 'Azure read scoped to one subscription',
    description:
      'Read-only access pinned to a single subscription_id supplied via context.allowed_subscription_id.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.subscription_id == context.allowed_subscription_id };`,
    visualReady: false,
  },
  {
    id: 'azure:read-scoped-to-rg',
    integrationId: 'azure',
    name: 'Azure read scoped to one resource group',
    description: 'Read-only pinned to a (subscription, resource_group) pair from context.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.subscription_id == context.allowed_subscription_id && resource.resource_group == context.allowed_resource_group };`,
    visualReady: false,
  },
  {
    id: 'azure:business-hours-read',
    integrationId: 'azure',
    name: 'Azure read only during business hours',
    description: 'Allows reads only between 09:00 and 17:00 UTC.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };`,
    visualReady: true,
  },
  {
    id: 'azure:metrics-and-inventory-only',
    integrationId: 'azure',
    name: 'Azure metrics and inventory only',
    description: 'FinOps-style read: list resources + read metrics. No storage / key-vault access.',
    cedarText: `permit (\n  principal,\n  action in [Action::"/azure/subscriptions/list", Action::"/azure/resource_groups/list", Action::"/azure/resources/list_by_rg", Action::"/azure/vm/list", Action::"/azure/vm/get", Action::"/azure/app_services/list", Action::"/azure/metrics/get"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'azure:raw-call-readonly',
    integrationId: 'azure',
    name: 'Azure raw_call read-only ARM',
    description:
      'Escape hatch: arbitrary GET requests to management.azure.com restricted to a path-prefix allowlist (context.allowed_prefixes) with cosigner required on first use.',
    cedarText: `permit (\n  principal,\n  action == Action::"${RAW_CALL}",\n  resource\n)\nwhen { resource.method == "GET" && resource.host == "management.azure.com" && resource.path_prefix in context.allowed_prefixes && context.cosigner == true };`,
    visualReady: false,
  },
];
