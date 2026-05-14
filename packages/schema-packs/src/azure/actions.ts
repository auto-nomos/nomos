/**
 * Azure schema-pack actions — M1 reads, M2 ops, M3 devops, M4 data + raw_call.
 *
 * Convention: `/azure/<service>/<verb>` mirrors `/github/...`.
 * Destructive actions (delete/stop/run_command) auto-cosign via the
 * risk-rules engine (apps/pdp/src/services/risk-rules.ts).
 */

// M1 — read-only MVP (10 actions).
export const READS = [
  '/azure/subscriptions/list',
  '/azure/resource_groups/list',
  '/azure/resources/list_by_rg',
  '/azure/vm/list',
  '/azure/vm/get',
  '/azure/storage_accounts/list',
  '/azure/blob_containers/list',
  '/azure/key_vaults/list',
  '/azure/app_services/list',
  '/azure/metrics/get',
] as const;

// M2 — SRE / ops (cosigner-gated by risk rules).
export const OPS = [
  '/azure/vm/restart',
  '/azure/vm/stop',
  '/azure/vm/start',
  '/azure/vm/run_command',
  '/azure/vmss/scale',
  '/azure/aks/cordon_node',
  '/azure/aks/drain_node',
  '/azure/key_vaults/rotate_secret',
  '/azure/app_services/redeploy',
  '/azure/app_services/restart',
] as const;

// M3 — DevOps / infra.
export const DEVOPS = [
  '/azure/deployments/create',
  '/azure/deployments/get',
  '/azure/app_services/slot_swap',
  '/azure/acr/push',
  '/azure/acr/tag',
  '/azure/pipelines/trigger',
] as const;

// M4 — data + raw_call.
export const DATA = [
  '/azure/blob/read',
  '/azure/blob/write',
  '/azure/cosmos/query',
  '/azure/synapse/query',
  '/azure/log_analytics/kql',
  '/azure/cost_management/query',
] as const;

export const DESTRUCTIVE = [
  '/azure/vm/delete',
  '/azure/storage_accounts/delete',
  '/azure/key_vaults/delete',
  '/azure/resource_groups/delete',
] as const;

export const RAW_CALL = '/azure/raw_call' as const;

export const WRITES = [...OPS, ...DEVOPS, ...DATA] as const;
export const DELETES = DESTRUCTIVE;
export const actions = [...READS, ...OPS, ...DEVOPS, ...DATA, ...DESTRUCTIVE, RAW_CALL] as const;

export const actionToCommand: Record<string, string> = {
  // M1
  list_subscriptions: '/azure/subscriptions/list',
  list_resource_groups: '/azure/resource_groups/list',
  list_resources_by_rg: '/azure/resources/list_by_rg',
  list_vms: '/azure/vm/list',
  get_vm: '/azure/vm/get',
  list_storage_accounts: '/azure/storage_accounts/list',
  list_blob_containers: '/azure/blob_containers/list',
  list_key_vaults: '/azure/key_vaults/list',
  list_app_services: '/azure/app_services/list',
  get_metric: '/azure/metrics/get',
  // M2
  restart_vm: '/azure/vm/restart',
  stop_vm: '/azure/vm/stop',
  start_vm: '/azure/vm/start',
  run_command_vm: '/azure/vm/run_command',
  scale_vmss: '/azure/vmss/scale',
  cordon_aks_node: '/azure/aks/cordon_node',
  drain_aks_node: '/azure/aks/drain_node',
  rotate_key_vault_secret: '/azure/key_vaults/rotate_secret',
  redeploy_app_service: '/azure/app_services/redeploy',
  restart_app_service: '/azure/app_services/restart',
  // M3
  create_deployment: '/azure/deployments/create',
  get_deployment: '/azure/deployments/get',
  slot_swap: '/azure/app_services/slot_swap',
  acr_push: '/azure/acr/push',
  acr_tag: '/azure/acr/tag',
  trigger_pipeline: '/azure/pipelines/trigger',
  // M4
  read_blob: '/azure/blob/read',
  write_blob: '/azure/blob/write',
  cosmos_query: '/azure/cosmos/query',
  synapse_query: '/azure/synapse/query',
  log_analytics_kql: '/azure/log_analytics/kql',
  cost_management_query: '/azure/cost_management/query',
  // Destructive
  delete_vm: '/azure/vm/delete',
  delete_storage_account: '/azure/storage_accounts/delete',
  delete_key_vault: '/azure/key_vaults/delete',
  delete_resource_group: '/azure/resource_groups/delete',
  // Escape hatch
  raw_call: '/azure/raw_call',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const subscriptionId =
    typeof params.subscription_id === 'string' ? params.subscription_id : undefined;
  const resourceGroup =
    typeof params.resource_group === 'string' ? params.resource_group : undefined;
  const resourceName = typeof params.name === 'string' ? params.name : undefined;
  const resourceType = typeof params.resource_type === 'string' ? params.resource_type : undefined;

  const base: Record<string, unknown> = {};
  if (subscriptionId) base.subscription_id = subscriptionId;
  if (resourceGroup) base.resource_group = resourceGroup;
  if (resourceName) base.name = resourceName;
  if (resourceType) base.resource_type = resourceType;

  // raw_call carries the request shape so policies can match on path prefix.
  if (actionId === 'raw_call') {
    return {
      ...base,
      method: typeof params.method === 'string' ? params.method : undefined,
      host: typeof params.host === 'string' ? params.host : undefined,
      path: typeof params.path === 'string' ? params.path : undefined,
      path_prefix: typeof params.path_prefix === 'string' ? params.path_prefix : undefined,
    };
  }

  switch (actionId) {
    case 'list_subscriptions':
      return {};
    case 'list_resource_groups':
    case 'list_storage_accounts':
    case 'list_vms':
    case 'list_key_vaults':
    case 'list_app_services':
      return subscriptionId ? { subscription_id: subscriptionId } : {};
    default:
      return base;
  }
}
