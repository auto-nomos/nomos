/**
 * Azure schema-pack actions — comprehensive coverage across resource providers.
 *
 * Convention: `/azure/<service>/<verb>` mirrors `/github/...`.
 * Risk tiers:
 *   read       — ARM GET; always safe.
 *   ops        — ARM POST/PATCH/PUT on a running resource; cosigner-gated
 *                if the verb hits the DESTRUCTIVE_VERBS list in
 *                apps/pdp/src/services/cloud-risk-rules.ts.
 *   devops     — provisioning / deployment ops.
 *   data       — data-plane (blob, cosmos, app config, log analytics).
 *   destructive — ARM DELETE; always cosigner-gated by risk rules.
 *
 * Adding a new action: append to the appropriate tier array, add a
 * `actionToCommand` entry, and register a schema in `schemas.ts`. The
 * benchmark harness (scripts/azure-coverage-benchmark.mts) discovers
 * everything in `actions` automatically.
 */

// M1 — read-only (10 actions).
export const READS = [
  // Subscription + management groups
  '/azure/subscriptions/list',
  '/azure/subscriptions/get',
  '/azure/management_groups/list',
  '/azure/management_groups/get',
  // Resource groups + generic resource lookups
  '/azure/resource_groups/list',
  '/azure/resource_groups/get',
  '/azure/resource_groups/export_template',
  '/azure/resources/list',
  '/azure/resources/list_by_rg',
  '/azure/resources/get',
  // Compute — VM
  '/azure/vm/list',
  '/azure/vm/get',
  '/azure/vm/get_instance_view',
  '/azure/vm/list_available_sizes',
  '/azure/vm/list_extensions',
  '/azure/vm/list_disks',
  // Compute — VMSS / disks / images
  '/azure/vmss/list',
  '/azure/vmss/get',
  '/azure/disks/list',
  '/azure/disks/get',
  '/azure/images/list',
  '/azure/snapshots/list',
  // Storage
  '/azure/storage_accounts/list',
  '/azure/storage_accounts/get',
  '/azure/storage_accounts/list_keys',
  '/azure/blob_containers/list',
  '/azure/blob_containers/get',
  '/azure/file_shares/list',
  '/azure/queues/list',
  '/azure/tables/list',
  // Key Vault — management plane
  '/azure/key_vaults/list',
  '/azure/key_vaults/get',
  '/azure/key_vaults/list_secrets',
  '/azure/key_vaults/get_secret',
  '/azure/key_vaults/list_keys',
  '/azure/key_vaults/get_key',
  '/azure/key_vaults/list_certificates',
  '/azure/key_vaults/get_certificate',
  // App Service / Functions
  '/azure/app_services/list',
  '/azure/app_services/get',
  '/azure/app_services/list_app_settings',
  '/azure/app_services/list_slots',
  '/azure/functions/list',
  '/azure/functions/get',
  // AKS
  '/azure/aks/list',
  '/azure/aks/get',
  '/azure/aks/list_node_pools',
  '/azure/aks/get_kubeconfig',
  // Cosmos DB
  '/azure/cosmos/list_accounts',
  '/azure/cosmos/get_account',
  '/azure/cosmos/list_databases',
  '/azure/cosmos/list_containers',
  '/azure/cosmos/list_keys',
  // Network
  '/azure/vnets/list',
  '/azure/vnets/get',
  '/azure/subnets/list',
  '/azure/nsgs/list',
  '/azure/nsgs/get',
  '/azure/public_ips/list',
  '/azure/load_balancers/list',
  '/azure/load_balancers/get',
  '/azure/application_gateways/list',
  '/azure/private_endpoints/list',
  '/azure/dns_zones/list',
  '/azure/dns_zones/list_records',
  // RBAC
  '/azure/rbac/list_role_assignments',
  '/azure/rbac/get_role_assignment',
  '/azure/rbac/list_role_definitions',
  // Monitor / observability
  '/azure/monitor/list_alerts',
  '/azure/monitor/list_metric_definitions',
  '/azure/monitor/list_diagnostic_settings',
  '/azure/monitor/list_activity_logs',
  '/azure/monitor/list_action_groups',
  '/azure/log_analytics/list_workspaces',
  '/azure/metrics/get',
  // Tags / Locks / Policy
  '/azure/tags/get',
  '/azure/locks/list',
  '/azure/policy/list_definitions',
  '/azure/policy/list_assignments',
  '/azure/policy/list_compliance_states',
  // Cost
  '/azure/cost_management/list_budgets',
  '/azure/cost_management/list_exports',
  '/azure/cost_management/forecast',
  // ACR
  '/azure/acr/list_registries',
  '/azure/acr/get_registry',
  '/azure/acr/list_repositories',
  '/azure/acr/list_tags',
  '/azure/acr/list_webhooks',
  // Logic Apps / Service Bus / Event Hub / Event Grid
  '/azure/logic_apps/list',
  '/azure/logic_apps/get',
  '/azure/service_bus/list_namespaces',
  '/azure/service_bus/list_queues',
  '/azure/service_bus/list_topics',
  '/azure/event_hub/list_namespaces',
  '/azure/event_hub/list_event_hubs',
  '/azure/event_grid/list_topics',
  // App Configuration
  '/azure/app_config/list_stores',
  '/azure/app_config/list_keys',
  '/azure/app_config/get_key',
  // Resource Health
  '/azure/resource_health/get',
  '/azure/resource_health/list_events',
  // Deployments
  '/azure/deployments/list',
  '/azure/deployments/get',
  '/azure/deployments/validate',
  '/azure/deployments/what_if',
] as const;

// M2 — write/ops on running resources (most are cosigner-gated).
export const OPS = [
  // VM lifecycle
  '/azure/vm/restart',
  '/azure/vm/stop',
  '/azure/vm/start',
  '/azure/vm/deallocate',
  '/azure/vm/redeploy',
  '/azure/vm/power_off',
  '/azure/vm/run_command',
  '/azure/vm/capture',
  '/azure/vm/install_extension',
  '/azure/vm/attach_disk',
  '/azure/vm/detach_disk',
  // VMSS
  '/azure/vmss/scale',
  '/azure/vmss/restart',
  '/azure/vmss/reimage',
  '/azure/vmss/upgrade_instances',
  // AKS
  '/azure/aks/start',
  '/azure/aks/stop',
  '/azure/aks/rotate_certificates',
  '/azure/aks/run_command',
  '/azure/aks/cordon_node',
  '/azure/aks/drain_node',
  '/azure/aks/scale_node_pool',
  '/azure/aks/upgrade_node_pool',
  // Storage management
  '/azure/storage_accounts/regenerate_key',
  '/azure/blob_containers/lease',
  '/azure/blob_containers/set_acl',
  // Key Vault rotations
  '/azure/key_vaults/rotate_secret',
  '/azure/key_vaults/update_policy',
  // App service control
  '/azure/app_services/redeploy',
  '/azure/app_services/restart',
  '/azure/app_services/stop',
  '/azure/app_services/start',
  '/azure/app_services/update_app_settings',
  '/azure/app_services/slot_swap',
  // Functions
  '/azure/functions/invoke',
  // Cosmos
  '/azure/cosmos/regenerate_key',
  // Network mutations
  '/azure/nsgs/add_rule',
  '/azure/dns_zones/create_record',
  // RBAC mutations
  '/azure/rbac/create_role_assignment',
  '/azure/rbac/create_role_definition',
  // Monitor mutations
  '/azure/monitor/create_diagnostic_setting',
  '/azure/monitor/create_alert_rule',
  // Tags / Locks / Policy mutations
  '/azure/tags/set',
  '/azure/locks/create',
  '/azure/policy/create_assignment',
  // Cost mutations
  '/azure/cost_management/create_budget',
  // Logic Apps runtime
  '/azure/logic_apps/trigger_run',
  '/azure/logic_apps/cancel_run',
  // App Configuration writes
  '/azure/app_config/set_key',
  // Deployments
  '/azure/deployments/cancel',
] as const;

// M3 — provisioning / DevOps (creates infrastructure).
export const DEVOPS = [
  '/azure/resource_groups/create',
  '/azure/resource_groups/update',
  '/azure/resources/move',
  '/azure/resources/tag',
  '/azure/vm/create',
  '/azure/disks/create',
  '/azure/snapshots/create',
  '/azure/storage_accounts/create',
  '/azure/storage_accounts/update',
  '/azure/blob_containers/create',
  '/azure/file_shares/create',
  '/azure/queues/create',
  '/azure/tables/create',
  '/azure/key_vaults/create',
  '/azure/key_vaults/set_secret',
  '/azure/key_vaults/create_key',
  '/azure/key_vaults/create_certificate',
  '/azure/app_services/create',
  '/azure/aks/create',
  '/azure/aks/update',
  '/azure/cosmos/create_account',
  '/azure/cosmos/create_database',
  '/azure/cosmos/create_container',
  '/azure/vnets/create',
  '/azure/subnets/create',
  '/azure/nsgs/create',
  '/azure/public_ips/create',
  '/azure/load_balancers/create',
  '/azure/service_bus/create_namespace',
  '/azure/service_bus/create_queue',
  '/azure/event_hub/create_event_hub',
  '/azure/event_grid/create_topic',
  '/azure/log_analytics/create_workspace',
  '/azure/deployments/create',
  '/azure/acr/create_registry',
  '/azure/acr/push',
  '/azure/acr/tag',
  '/azure/pipelines/trigger',
] as const;

// M4 — data plane (blob/cosmos/log analytics/app config).
export const DATA = [
  '/azure/blob/read',
  '/azure/blob/write',
  '/azure/blob/list',
  '/azure/blob/delete',
  '/azure/cosmos/query',
  '/azure/cosmos/create_item',
  '/azure/cosmos/get_item',
  '/azure/cosmos/delete_item',
  '/azure/synapse/query',
  '/azure/log_analytics/kql',
  '/azure/cost_management/query',
] as const;

// Destructive — ARM DELETE; always cosigner-gated.
export const DESTRUCTIVE = [
  '/azure/resource_groups/delete',
  '/azure/resources/delete',
  '/azure/vm/delete',
  '/azure/vm/uninstall_extension',
  '/azure/vmss/delete_instance',
  '/azure/vmss/delete',
  '/azure/disks/delete',
  '/azure/snapshots/delete',
  '/azure/storage_accounts/delete',
  '/azure/blob_containers/delete',
  '/azure/file_shares/delete',
  '/azure/queues/delete',
  '/azure/tables/delete',
  '/azure/key_vaults/delete',
  '/azure/key_vaults/delete_secret',
  '/azure/key_vaults/delete_key',
  '/azure/key_vaults/delete_certificate',
  '/azure/key_vaults/purge',
  '/azure/app_services/delete',
  '/azure/functions/delete',
  '/azure/aks/delete',
  '/azure/aks/delete_node_pool',
  '/azure/cosmos/delete_account',
  '/azure/cosmos/delete_database',
  '/azure/cosmos/delete_container',
  '/azure/vnets/delete',
  '/azure/subnets/delete',
  '/azure/nsgs/delete',
  '/azure/nsgs/remove_rule',
  '/azure/public_ips/delete',
  '/azure/load_balancers/delete',
  '/azure/dns_zones/delete_record',
  '/azure/rbac/delete_role_assignment',
  '/azure/tags/delete',
  '/azure/locks/delete',
  '/azure/policy/delete_assignment',
  '/azure/monitor/delete_alert_rule',
  '/azure/cost_management/delete_budget',
  '/azure/logic_apps/delete',
  '/azure/service_bus/delete_namespace',
  '/azure/service_bus/delete_queue',
  '/azure/event_hub/delete_event_hub',
  '/azure/event_grid/delete_topic',
  '/azure/app_config/delete_key',
  '/azure/acr/delete_image',
  '/azure/acr/delete_registry',
  '/azure/log_analytics/delete_workspace',
  '/azure/deployments/delete',
] as const;

export const RAW_CALL = '/azure/raw_call' as const;

export const WRITES = [...OPS, ...DEVOPS, ...DATA] as const;
export const DELETES = DESTRUCTIVE;
export const actions = [...READS, ...OPS, ...DEVOPS, ...DATA, ...DESTRUCTIVE, RAW_CALL] as const;

/**
 * Stable kebab-case action ids that adapter callers (MCP server, SDK)
 * map to commands. New ids must be unique across the map.
 */
export const actionToCommand: Record<string, string> = {
  // Subscription + management groups
  list_subscriptions: '/azure/subscriptions/list',
  get_subscription: '/azure/subscriptions/get',
  list_management_groups: '/azure/management_groups/list',
  get_management_group: '/azure/management_groups/get',
  // Resource groups + generic
  list_resource_groups: '/azure/resource_groups/list',
  get_resource_group: '/azure/resource_groups/get',
  export_resource_group_template: '/azure/resource_groups/export_template',
  create_resource_group: '/azure/resource_groups/create',
  update_resource_group: '/azure/resource_groups/update',
  delete_resource_group: '/azure/resource_groups/delete',
  list_resources: '/azure/resources/list',
  list_resources_by_rg: '/azure/resources/list_by_rg',
  get_resource: '/azure/resources/get',
  delete_resource: '/azure/resources/delete',
  move_resources: '/azure/resources/move',
  tag_resource: '/azure/resources/tag',
  // VM
  list_vms: '/azure/vm/list',
  get_vm: '/azure/vm/get',
  get_vm_instance_view: '/azure/vm/get_instance_view',
  list_vm_sizes: '/azure/vm/list_available_sizes',
  list_vm_extensions: '/azure/vm/list_extensions',
  install_vm_extension: '/azure/vm/install_extension',
  uninstall_vm_extension: '/azure/vm/uninstall_extension',
  list_vm_disks: '/azure/vm/list_disks',
  attach_vm_disk: '/azure/vm/attach_disk',
  detach_vm_disk: '/azure/vm/detach_disk',
  create_vm: '/azure/vm/create',
  restart_vm: '/azure/vm/restart',
  stop_vm: '/azure/vm/stop',
  start_vm: '/azure/vm/start',
  deallocate_vm: '/azure/vm/deallocate',
  redeploy_vm: '/azure/vm/redeploy',
  power_off_vm: '/azure/vm/power_off',
  capture_vm: '/azure/vm/capture',
  run_command_vm: '/azure/vm/run_command',
  delete_vm: '/azure/vm/delete',
  // VMSS
  list_vmss: '/azure/vmss/list',
  get_vmss: '/azure/vmss/get',
  scale_vmss: '/azure/vmss/scale',
  restart_vmss: '/azure/vmss/restart',
  reimage_vmss: '/azure/vmss/reimage',
  upgrade_vmss_instances: '/azure/vmss/upgrade_instances',
  delete_vmss_instance: '/azure/vmss/delete_instance',
  delete_vmss: '/azure/vmss/delete',
  // Disks / images / snapshots
  list_disks: '/azure/disks/list',
  get_disk: '/azure/disks/get',
  create_disk: '/azure/disks/create',
  delete_disk: '/azure/disks/delete',
  list_images: '/azure/images/list',
  list_snapshots: '/azure/snapshots/list',
  create_snapshot: '/azure/snapshots/create',
  delete_snapshot: '/azure/snapshots/delete',
  // Storage
  list_storage_accounts: '/azure/storage_accounts/list',
  get_storage_account: '/azure/storage_accounts/get',
  create_storage_account: '/azure/storage_accounts/create',
  update_storage_account: '/azure/storage_accounts/update',
  list_storage_keys: '/azure/storage_accounts/list_keys',
  regenerate_storage_key: '/azure/storage_accounts/regenerate_key',
  delete_storage_account: '/azure/storage_accounts/delete',
  list_blob_containers: '/azure/blob_containers/list',
  get_blob_container: '/azure/blob_containers/get',
  create_blob_container: '/azure/blob_containers/create',
  lease_blob_container: '/azure/blob_containers/lease',
  set_blob_container_acl: '/azure/blob_containers/set_acl',
  delete_blob_container: '/azure/blob_containers/delete',
  list_file_shares: '/azure/file_shares/list',
  create_file_share: '/azure/file_shares/create',
  delete_file_share: '/azure/file_shares/delete',
  list_queues: '/azure/queues/list',
  create_queue: '/azure/queues/create',
  delete_queue: '/azure/queues/delete',
  list_tables: '/azure/tables/list',
  create_table: '/azure/tables/create',
  delete_table: '/azure/tables/delete',
  // Key Vault
  list_key_vaults: '/azure/key_vaults/list',
  get_key_vault: '/azure/key_vaults/get',
  create_key_vault: '/azure/key_vaults/create',
  update_key_vault_policy: '/azure/key_vaults/update_policy',
  delete_key_vault: '/azure/key_vaults/delete',
  list_kv_secrets: '/azure/key_vaults/list_secrets',
  get_kv_secret: '/azure/key_vaults/get_secret',
  set_kv_secret: '/azure/key_vaults/set_secret',
  rotate_kv_secret: '/azure/key_vaults/rotate_secret',
  delete_kv_secret: '/azure/key_vaults/delete_secret',
  list_kv_keys: '/azure/key_vaults/list_keys',
  get_kv_key: '/azure/key_vaults/get_key',
  create_kv_key: '/azure/key_vaults/create_key',
  delete_kv_key: '/azure/key_vaults/delete_key',
  list_kv_certificates: '/azure/key_vaults/list_certificates',
  get_kv_certificate: '/azure/key_vaults/get_certificate',
  create_kv_certificate: '/azure/key_vaults/create_certificate',
  delete_kv_certificate: '/azure/key_vaults/delete_certificate',
  purge_key_vault: '/azure/key_vaults/purge',
  // App Service / Functions
  list_app_services: '/azure/app_services/list',
  get_app_service: '/azure/app_services/get',
  create_app_service: '/azure/app_services/create',
  delete_app_service: '/azure/app_services/delete',
  start_app_service: '/azure/app_services/start',
  stop_app_service: '/azure/app_services/stop',
  restart_app_service: '/azure/app_services/restart',
  redeploy_app_service: '/azure/app_services/redeploy',
  slot_swap_app_service: '/azure/app_services/slot_swap',
  list_app_settings: '/azure/app_services/list_app_settings',
  update_app_settings: '/azure/app_services/update_app_settings',
  list_app_service_slots: '/azure/app_services/list_slots',
  list_functions: '/azure/functions/list',
  get_function: '/azure/functions/get',
  invoke_function: '/azure/functions/invoke',
  delete_function: '/azure/functions/delete',
  // AKS
  list_aks: '/azure/aks/list',
  get_aks: '/azure/aks/get',
  create_aks: '/azure/aks/create',
  update_aks: '/azure/aks/update',
  start_aks: '/azure/aks/start',
  stop_aks: '/azure/aks/stop',
  rotate_aks_certificates: '/azure/aks/rotate_certificates',
  run_command_aks: '/azure/aks/run_command',
  list_aks_node_pools: '/azure/aks/list_node_pools',
  scale_aks_node_pool: '/azure/aks/scale_node_pool',
  upgrade_aks_node_pool: '/azure/aks/upgrade_node_pool',
  delete_aks_node_pool: '/azure/aks/delete_node_pool',
  get_aks_kubeconfig: '/azure/aks/get_kubeconfig',
  cordon_aks_node: '/azure/aks/cordon_node',
  drain_aks_node: '/azure/aks/drain_node',
  delete_aks: '/azure/aks/delete',
  // Cosmos
  list_cosmos_accounts: '/azure/cosmos/list_accounts',
  get_cosmos_account: '/azure/cosmos/get_account',
  create_cosmos_account: '/azure/cosmos/create_account',
  delete_cosmos_account: '/azure/cosmos/delete_account',
  list_cosmos_databases: '/azure/cosmos/list_databases',
  create_cosmos_database: '/azure/cosmos/create_database',
  delete_cosmos_database: '/azure/cosmos/delete_database',
  list_cosmos_containers: '/azure/cosmos/list_containers',
  create_cosmos_container: '/azure/cosmos/create_container',
  delete_cosmos_container: '/azure/cosmos/delete_container',
  list_cosmos_keys: '/azure/cosmos/list_keys',
  regenerate_cosmos_key: '/azure/cosmos/regenerate_key',
  cosmos_query: '/azure/cosmos/query',
  cosmos_create_item: '/azure/cosmos/create_item',
  cosmos_get_item: '/azure/cosmos/get_item',
  cosmos_delete_item: '/azure/cosmos/delete_item',
  // Network
  list_vnets: '/azure/vnets/list',
  get_vnet: '/azure/vnets/get',
  create_vnet: '/azure/vnets/create',
  delete_vnet: '/azure/vnets/delete',
  list_subnets: '/azure/subnets/list',
  create_subnet: '/azure/subnets/create',
  delete_subnet: '/azure/subnets/delete',
  list_nsgs: '/azure/nsgs/list',
  get_nsg: '/azure/nsgs/get',
  create_nsg: '/azure/nsgs/create',
  add_nsg_rule: '/azure/nsgs/add_rule',
  remove_nsg_rule: '/azure/nsgs/remove_rule',
  delete_nsg: '/azure/nsgs/delete',
  list_public_ips: '/azure/public_ips/list',
  create_public_ip: '/azure/public_ips/create',
  delete_public_ip: '/azure/public_ips/delete',
  list_load_balancers: '/azure/load_balancers/list',
  get_load_balancer: '/azure/load_balancers/get',
  create_load_balancer: '/azure/load_balancers/create',
  delete_load_balancer: '/azure/load_balancers/delete',
  list_application_gateways: '/azure/application_gateways/list',
  list_private_endpoints: '/azure/private_endpoints/list',
  list_dns_zones: '/azure/dns_zones/list',
  list_dns_records: '/azure/dns_zones/list_records',
  create_dns_record: '/azure/dns_zones/create_record',
  delete_dns_record: '/azure/dns_zones/delete_record',
  // RBAC
  list_role_assignments: '/azure/rbac/list_role_assignments',
  get_role_assignment: '/azure/rbac/get_role_assignment',
  create_role_assignment: '/azure/rbac/create_role_assignment',
  delete_role_assignment: '/azure/rbac/delete_role_assignment',
  list_role_definitions: '/azure/rbac/list_role_definitions',
  create_role_definition: '/azure/rbac/create_role_definition',
  // Monitor
  list_alerts: '/azure/monitor/list_alerts',
  list_metric_definitions: '/azure/monitor/list_metric_definitions',
  list_diagnostic_settings: '/azure/monitor/list_diagnostic_settings',
  create_diagnostic_setting: '/azure/monitor/create_diagnostic_setting',
  list_activity_logs: '/azure/monitor/list_activity_logs',
  list_action_groups: '/azure/monitor/list_action_groups',
  create_alert_rule: '/azure/monitor/create_alert_rule',
  delete_alert_rule: '/azure/monitor/delete_alert_rule',
  list_log_analytics_workspaces: '/azure/log_analytics/list_workspaces',
  create_log_analytics_workspace: '/azure/log_analytics/create_workspace',
  delete_log_analytics_workspace: '/azure/log_analytics/delete_workspace',
  log_analytics_kql: '/azure/log_analytics/kql',
  get_metric: '/azure/metrics/get',
  // Tags / Locks / Policy
  get_tags: '/azure/tags/get',
  set_tags: '/azure/tags/set',
  delete_tags: '/azure/tags/delete',
  list_locks: '/azure/locks/list',
  create_lock: '/azure/locks/create',
  delete_lock: '/azure/locks/delete',
  list_policy_definitions: '/azure/policy/list_definitions',
  list_policy_assignments: '/azure/policy/list_assignments',
  create_policy_assignment: '/azure/policy/create_assignment',
  delete_policy_assignment: '/azure/policy/delete_assignment',
  list_policy_compliance: '/azure/policy/list_compliance_states',
  // Cost
  cost_management_query: '/azure/cost_management/query',
  list_budgets: '/azure/cost_management/list_budgets',
  create_budget: '/azure/cost_management/create_budget',
  delete_budget: '/azure/cost_management/delete_budget',
  list_exports: '/azure/cost_management/list_exports',
  cost_forecast: '/azure/cost_management/forecast',
  // ACR
  list_acr_registries: '/azure/acr/list_registries',
  get_acr_registry: '/azure/acr/get_registry',
  create_acr_registry: '/azure/acr/create_registry',
  delete_acr_registry: '/azure/acr/delete_registry',
  list_acr_repositories: '/azure/acr/list_repositories',
  list_acr_tags: '/azure/acr/list_tags',
  list_acr_webhooks: '/azure/acr/list_webhooks',
  acr_push: '/azure/acr/push',
  acr_tag: '/azure/acr/tag',
  delete_acr_image: '/azure/acr/delete_image',
  // Logic Apps / Service Bus / Event Hub / Event Grid
  list_logic_apps: '/azure/logic_apps/list',
  get_logic_app: '/azure/logic_apps/get',
  trigger_logic_app_run: '/azure/logic_apps/trigger_run',
  cancel_logic_app_run: '/azure/logic_apps/cancel_run',
  delete_logic_app: '/azure/logic_apps/delete',
  list_service_bus_namespaces: '/azure/service_bus/list_namespaces',
  create_service_bus_namespace: '/azure/service_bus/create_namespace',
  delete_service_bus_namespace: '/azure/service_bus/delete_namespace',
  list_service_bus_queues: '/azure/service_bus/list_queues',
  create_service_bus_queue: '/azure/service_bus/create_queue',
  delete_service_bus_queue: '/azure/service_bus/delete_queue',
  list_service_bus_topics: '/azure/service_bus/list_topics',
  list_event_hub_namespaces: '/azure/event_hub/list_namespaces',
  list_event_hubs: '/azure/event_hub/list_event_hubs',
  create_event_hub: '/azure/event_hub/create_event_hub',
  delete_event_hub: '/azure/event_hub/delete_event_hub',
  list_event_grid_topics: '/azure/event_grid/list_topics',
  create_event_grid_topic: '/azure/event_grid/create_topic',
  delete_event_grid_topic: '/azure/event_grid/delete_topic',
  // App Configuration
  list_app_config_stores: '/azure/app_config/list_stores',
  list_app_config_keys: '/azure/app_config/list_keys',
  get_app_config_key: '/azure/app_config/get_key',
  set_app_config_key: '/azure/app_config/set_key',
  delete_app_config_key: '/azure/app_config/delete_key',
  // Resource Health
  get_resource_health: '/azure/resource_health/get',
  list_health_events: '/azure/resource_health/list_events',
  // Deployments
  list_deployments: '/azure/deployments/list',
  get_deployment: '/azure/deployments/get',
  create_deployment: '/azure/deployments/create',
  cancel_deployment: '/azure/deployments/cancel',
  delete_deployment: '/azure/deployments/delete',
  validate_deployment: '/azure/deployments/validate',
  what_if_deployment: '/azure/deployments/what_if',
  // Blob (data plane)
  read_blob: '/azure/blob/read',
  write_blob: '/azure/blob/write',
  list_blobs: '/azure/blob/list',
  delete_blob: '/azure/blob/delete',
  // Data plane other
  synapse_query: '/azure/synapse/query',
  // Pipelines
  trigger_pipeline: '/azure/pipelines/trigger',
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
    case 'list_management_groups':
      return {};
    case 'list_resource_groups':
    case 'list_storage_accounts':
    case 'list_vms':
    case 'list_key_vaults':
    case 'list_app_services':
    case 'list_aks':
    case 'list_vnets':
    case 'list_nsgs':
    case 'list_public_ips':
    case 'list_load_balancers':
    case 'list_application_gateways':
    case 'list_private_endpoints':
    case 'list_dns_zones':
    case 'list_cosmos_accounts':
    case 'list_logic_apps':
    case 'list_service_bus_namespaces':
    case 'list_event_hub_namespaces':
    case 'list_event_grid_topics':
    case 'list_app_config_stores':
    case 'list_log_analytics_workspaces':
    case 'list_acr_registries':
    case 'list_disks':
    case 'list_images':
    case 'list_snapshots':
    case 'list_vmss':
      return subscriptionId ? { subscription_id: subscriptionId } : {};
    default:
      return base;
  }
}
