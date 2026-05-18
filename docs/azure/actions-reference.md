# Actions reference

This page enumerates every Azure command Nomos recognizes. Each entry is
the canonical source of truth — the command string the agent passes to
`/v1/mint-ucan`, the HTTP method the proxy expects, the ARM URL template
the proxy fills, and the risk class.

| Total | Reads | Ops | Provisioning | Data plane | Destructive |
|---|---|---|---|---|---|
| **253** | 105 | 50 | 38 | 11 | 48 + raw-call |

**Risk classes**
- `read` — ARM GET; always allowed if Cedar permits.
- `ops` — Mutates running resources; cosigner-gated only if verb matches the destructive list.
- `devops` — Provisions infrastructure; non-destructive.
- `data` — Data-plane write/query; non-destructive unless verb matches destructive list.
- `destructive` — ARM DELETE or destructive verb; always cosigner-gated regardless of Cedar.

**Required Azure RBAC** column lists the **minimum** built-in role. Custom
roles can carve narrower permissions; see [permissions-and-scopes.md](./permissions-and-scopes.md).

---

## Subscriptions and management groups

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/subscriptions/list` | GET | read | Reader (none for own subs) |
| `/azure/subscriptions/get` | GET | read | Reader |
| `/azure/management_groups/list` | GET | read | Management Group Reader |
| `/azure/management_groups/get` | GET | read | Management Group Reader |

## Resource groups and generic resources

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/resource_groups/list` | GET | read | Reader |
| `/azure/resource_groups/get` | GET | read | Reader |
| `/azure/resource_groups/export_template` | POST | read | Reader |
| `/azure/resource_groups/create` | PUT | devops | Contributor (subscription) |
| `/azure/resource_groups/update` | PATCH | devops | Contributor (RG) |
| `/azure/resource_groups/delete` | DELETE | destructive | Owner / custom |
| `/azure/resources/list` | GET | read | Reader |
| `/azure/resources/list_by_rg` | GET | read | Reader |
| `/azure/resources/get` | GET | read | Reader |
| `/azure/resources/delete` | DELETE | destructive | Contributor |
| `/azure/resources/move` | POST | devops | Contributor (both source + dest) |
| `/azure/resources/tag` | PATCH | devops | `Microsoft.Resources/tags/write` |

## Compute — virtual machines

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/vm/list` | GET | read | Reader |
| `/azure/vm/get` | GET | read | Reader |
| `/azure/vm/get_instance_view` | GET | read | Reader |
| `/azure/vm/list_available_sizes` | GET | read | Reader |
| `/azure/vm/list_extensions` | GET | read | Reader |
| `/azure/vm/list_disks` | GET | read | Reader |
| `/azure/vm/create` | PUT | devops | Virtual Machine Contributor |
| `/azure/vm/restart` | POST | ops | Virtual Machine Contributor |
| `/azure/vm/start` | POST | ops | Virtual Machine Contributor |
| `/azure/vm/stop` | POST | destructive | Virtual Machine Contributor |
| `/azure/vm/deallocate` | POST | destructive | Virtual Machine Contributor |
| `/azure/vm/redeploy` | POST | destructive | Virtual Machine Contributor |
| `/azure/vm/power_off` | POST | destructive | Virtual Machine Contributor |
| `/azure/vm/run_command` | POST | destructive | Virtual Machine Contributor + custom |
| `/azure/vm/capture` | POST | destructive | Virtual Machine Contributor |
| `/azure/vm/install_extension` | PUT | ops | Virtual Machine Contributor |
| `/azure/vm/uninstall_extension` | DELETE | destructive | Virtual Machine Contributor |
| `/azure/vm/attach_disk` | PATCH | ops | Virtual Machine Contributor |
| `/azure/vm/detach_disk` | PATCH | destructive | Virtual Machine Contributor |
| `/azure/vm/delete` | DELETE | destructive | Virtual Machine Contributor |

## Compute — VMSS, disks, images, snapshots

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/vmss/list` | GET | read | Reader |
| `/azure/vmss/get` | GET | read | Reader |
| `/azure/vmss/scale` | PATCH | destructive | VMSS Contributor |
| `/azure/vmss/restart` | POST | ops | VMSS Contributor |
| `/azure/vmss/reimage` | POST | destructive | VMSS Contributor |
| `/azure/vmss/upgrade_instances` | POST | ops | VMSS Contributor |
| `/azure/vmss/delete_instance` | DELETE | destructive | VMSS Contributor |
| `/azure/vmss/delete` | DELETE | destructive | VMSS Contributor |
| `/azure/disks/list` | GET | read | Reader |
| `/azure/disks/get` | GET | read | Reader |
| `/azure/disks/create` | PUT | devops | Disk Contributor |
| `/azure/disks/delete` | DELETE | destructive | Disk Contributor |
| `/azure/images/list` | GET | read | Reader |
| `/azure/snapshots/list` | GET | read | Reader |
| `/azure/snapshots/create` | PUT | devops | Disk Snapshot Contributor |
| `/azure/snapshots/delete` | DELETE | destructive | Disk Snapshot Contributor |

## Storage — accounts, containers, file shares, queues, tables

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/storage_accounts/list` | GET | read | Reader |
| `/azure/storage_accounts/get` | GET | read | Reader |
| `/azure/storage_accounts/list_keys` | POST | read | Storage Account Key Operator |
| `/azure/storage_accounts/create` | PUT | devops | Storage Account Contributor |
| `/azure/storage_accounts/update` | PATCH | devops | Storage Account Contributor |
| `/azure/storage_accounts/regenerate_key` | POST | destructive | Storage Account Key Operator |
| `/azure/storage_accounts/delete` | DELETE | destructive | Storage Account Contributor |
| `/azure/blob_containers/list` | GET | read | Reader |
| `/azure/blob_containers/get` | GET | read | Reader |
| `/azure/blob_containers/create` | PUT | devops | Storage Blob Data Contributor |
| `/azure/blob_containers/lease` | PUT | ops | Storage Blob Data Contributor |
| `/azure/blob_containers/set_acl` | PUT | ops | Storage Blob Data Owner |
| `/azure/blob_containers/delete` | DELETE | destructive | Storage Blob Data Contributor |
| `/azure/file_shares/list` | GET | read | Reader |
| `/azure/file_shares/create` | PUT | devops | Storage File Data Contributor |
| `/azure/file_shares/delete` | DELETE | destructive | Storage File Data Contributor |
| `/azure/queues/list` | GET | read | Reader |
| `/azure/queues/create` | PUT | devops | Storage Queue Data Contributor |
| `/azure/queues/delete` | DELETE | destructive | Storage Queue Data Contributor |
| `/azure/tables/list` | GET | read | Reader |
| `/azure/tables/create` | PUT | devops | Storage Table Data Contributor |
| `/azure/tables/delete` | DELETE | destructive | Storage Table Data Contributor |

## Storage data plane — blobs

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/blob/list` | GET | data | Storage Blob Data Reader |
| `/azure/blob/read` | GET | data | Storage Blob Data Reader |
| `/azure/blob/write` | PUT | data | Storage Blob Data Contributor |
| `/azure/blob/delete` | DELETE | destructive | Storage Blob Data Contributor |

## Key Vault — management plane

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/key_vaults/list` | GET | read | Reader |
| `/azure/key_vaults/get` | GET | read | Reader |
| `/azure/key_vaults/create` | PUT | devops | Key Vault Contributor |
| `/azure/key_vaults/update_policy` | PUT | ops | Key Vault Contributor |
| `/azure/key_vaults/delete` | DELETE | destructive | Key Vault Contributor |
| `/azure/key_vaults/purge` | POST | destructive | Key Vault Data Access Administrator |
| `/azure/key_vaults/list_secrets` | GET | read | Key Vault Secrets User |
| `/azure/key_vaults/get_secret` | GET | read | Key Vault Secrets User |
| `/azure/key_vaults/set_secret` | PUT | devops | Key Vault Secrets Officer |
| `/azure/key_vaults/rotate_secret` | POST | destructive | Key Vault Secrets Officer |
| `/azure/key_vaults/delete_secret` | DELETE | destructive | Key Vault Secrets Officer |
| `/azure/key_vaults/list_keys` | GET | read | Key Vault Crypto User |
| `/azure/key_vaults/get_key` | GET | read | Key Vault Crypto User |
| `/azure/key_vaults/create_key` | POST | devops | Key Vault Crypto Officer |
| `/azure/key_vaults/delete_key` | DELETE | destructive | Key Vault Crypto Officer |
| `/azure/key_vaults/list_certificates` | GET | read | Key Vault Certificates User |
| `/azure/key_vaults/get_certificate` | GET | read | Key Vault Certificates User |
| `/azure/key_vaults/create_certificate` | POST | devops | Key Vault Certificates Officer |
| `/azure/key_vaults/delete_certificate` | DELETE | destructive | Key Vault Certificates Officer |

## App Service and Functions

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/app_services/list` | GET | read | Reader |
| `/azure/app_services/get` | GET | read | Reader |
| `/azure/app_services/list_app_settings` | POST | read | Website Contributor |
| `/azure/app_services/list_slots` | GET | read | Reader |
| `/azure/app_services/create` | PUT | devops | Website Contributor |
| `/azure/app_services/start` | POST | ops | Website Contributor |
| `/azure/app_services/stop` | POST | destructive | Website Contributor |
| `/azure/app_services/restart` | POST | ops | Website Contributor |
| `/azure/app_services/redeploy` | POST | destructive | Website Contributor |
| `/azure/app_services/slot_swap` | POST | destructive | Website Contributor |
| `/azure/app_services/update_app_settings` | PUT | ops | Website Contributor |
| `/azure/app_services/delete` | DELETE | destructive | Website Contributor |
| `/azure/functions/list` | GET | read | Reader |
| `/azure/functions/get` | GET | read | Reader |
| `/azure/functions/invoke` | POST | destructive | Website Contributor |
| `/azure/functions/delete` | DELETE | destructive | Website Contributor |

## AKS

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/aks/list` | GET | read | Reader |
| `/azure/aks/get` | GET | read | Reader |
| `/azure/aks/list_node_pools` | GET | read | Reader |
| `/azure/aks/get_kubeconfig` | POST | read | AKS Cluster User |
| `/azure/aks/create` | PUT | devops | AKS Contributor |
| `/azure/aks/update` | PATCH | devops | AKS Contributor |
| `/azure/aks/start` | POST | ops | AKS Contributor |
| `/azure/aks/stop` | POST | destructive | AKS Contributor |
| `/azure/aks/rotate_certificates` | POST | destructive | AKS Contributor |
| `/azure/aks/run_command` | POST | destructive | AKS RBAC Cluster Admin |
| `/azure/aks/cordon_node` | POST | ops | AKS Cluster Admin |
| `/azure/aks/drain_node` | POST | destructive | AKS Cluster Admin |
| `/azure/aks/scale_node_pool` | PATCH | destructive | AKS Contributor |
| `/azure/aks/upgrade_node_pool` | PATCH | ops | AKS Contributor |
| `/azure/aks/delete_node_pool` | DELETE | destructive | AKS Contributor |
| `/azure/aks/delete` | DELETE | destructive | AKS Contributor |

## Cosmos DB

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/cosmos/list_accounts` | GET | read | Reader |
| `/azure/cosmos/get_account` | GET | read | Reader |
| `/azure/cosmos/create_account` | PUT | devops | Cosmos DB Account Contributor |
| `/azure/cosmos/delete_account` | DELETE | destructive | Cosmos DB Account Contributor |
| `/azure/cosmos/list_databases` | GET | read | Reader |
| `/azure/cosmos/create_database` | PUT | devops | Cosmos DB Account Contributor |
| `/azure/cosmos/delete_database` | DELETE | destructive | Cosmos DB Account Contributor |
| `/azure/cosmos/list_containers` | GET | read | Reader |
| `/azure/cosmos/create_container` | PUT | devops | Cosmos DB Account Contributor |
| `/azure/cosmos/delete_container` | DELETE | destructive | Cosmos DB Account Contributor |
| `/azure/cosmos/list_keys` | POST | read | Cosmos DB Account Reader Role |
| `/azure/cosmos/regenerate_key` | POST | destructive | Cosmos DB Account Contributor |
| `/azure/cosmos/query` | POST | data | Cosmos DB Built-in Data Reader |
| `/azure/cosmos/create_item` | POST | data | Cosmos DB Built-in Data Contributor |
| `/azure/cosmos/get_item` | GET | data | Cosmos DB Built-in Data Reader |
| `/azure/cosmos/delete_item` | DELETE | destructive | Cosmos DB Built-in Data Contributor |

## Networking

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/vnets/list` | GET | read | Reader |
| `/azure/vnets/get` | GET | read | Reader |
| `/azure/vnets/create` | PUT | devops | Network Contributor |
| `/azure/vnets/delete` | DELETE | destructive | Network Contributor |
| `/azure/subnets/list` | GET | read | Reader |
| `/azure/subnets/create` | PUT | devops | Network Contributor |
| `/azure/subnets/delete` | DELETE | destructive | Network Contributor |
| `/azure/nsgs/list` | GET | read | Reader |
| `/azure/nsgs/get` | GET | read | Reader |
| `/azure/nsgs/create` | PUT | devops | Network Contributor |
| `/azure/nsgs/add_rule` | PUT | ops | Network Contributor |
| `/azure/nsgs/remove_rule` | DELETE | destructive | Network Contributor |
| `/azure/nsgs/delete` | DELETE | destructive | Network Contributor |
| `/azure/public_ips/list` | GET | read | Reader |
| `/azure/public_ips/create` | PUT | devops | Network Contributor |
| `/azure/public_ips/delete` | DELETE | destructive | Network Contributor |
| `/azure/load_balancers/list` | GET | read | Reader |
| `/azure/load_balancers/get` | GET | read | Reader |
| `/azure/load_balancers/create` | PUT | devops | Network Contributor |
| `/azure/load_balancers/delete` | DELETE | destructive | Network Contributor |
| `/azure/application_gateways/list` | GET | read | Reader |
| `/azure/private_endpoints/list` | GET | read | Reader |
| `/azure/dns_zones/list` | GET | read | Reader |
| `/azure/dns_zones/list_records` | GET | read | Reader |
| `/azure/dns_zones/create_record` | PUT | devops | DNS Zone Contributor |
| `/azure/dns_zones/delete_record` | DELETE | destructive | DNS Zone Contributor |

## RBAC

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/rbac/list_role_assignments` | GET | read | Reader |
| `/azure/rbac/get_role_assignment` | GET | read | Reader |
| `/azure/rbac/create_role_assignment` | PUT | devops | User Access Administrator |
| `/azure/rbac/delete_role_assignment` | DELETE | destructive | User Access Administrator |
| `/azure/rbac/list_role_definitions` | GET | read | Reader |
| `/azure/rbac/create_role_definition` | PUT | devops | User Access Administrator |

## Monitor and observability

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/monitor/list_alerts` | GET | read | Monitoring Reader |
| `/azure/monitor/list_metric_definitions` | GET | read | Monitoring Reader |
| `/azure/monitor/list_diagnostic_settings` | GET | read | Monitoring Reader |
| `/azure/monitor/list_activity_logs` | GET | read | Monitoring Reader |
| `/azure/monitor/list_action_groups` | GET | read | Monitoring Reader |
| `/azure/monitor/create_diagnostic_setting` | PUT | devops | Monitoring Contributor |
| `/azure/monitor/create_alert_rule` | PUT | devops | Monitoring Contributor |
| `/azure/monitor/delete_alert_rule` | DELETE | destructive | Monitoring Contributor |
| `/azure/log_analytics/list_workspaces` | GET | read | Log Analytics Reader |
| `/azure/log_analytics/create_workspace` | PUT | devops | Log Analytics Contributor |
| `/azure/log_analytics/delete_workspace` | DELETE | destructive | Log Analytics Contributor |
| `/azure/log_analytics/kql` | POST | data | Log Analytics Reader |
| `/azure/metrics/get` | GET | read | Monitoring Reader |

## Tags, Locks, Policy

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/tags/get` | GET | read | Reader |
| `/azure/tags/set` | PATCH | ops | `Microsoft.Resources/tags/write` |
| `/azure/tags/delete` | DELETE | destructive | `Microsoft.Resources/tags/delete` |
| `/azure/locks/list` | GET | read | Reader |
| `/azure/locks/create` | PUT | ops | Resource Policy Contributor |
| `/azure/locks/delete` | DELETE | destructive | Resource Policy Contributor |
| `/azure/policy/list_definitions` | GET | read | Reader |
| `/azure/policy/list_assignments` | GET | read | Reader |
| `/azure/policy/create_assignment` | PUT | devops | Resource Policy Contributor |
| `/azure/policy/delete_assignment` | DELETE | destructive | Resource Policy Contributor |
| `/azure/policy/list_compliance_states` | GET | read | Reader |

## Cost management

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/cost_management/list_budgets` | GET | read | Cost Management Reader |
| `/azure/cost_management/create_budget` | PUT | devops | Cost Management Contributor |
| `/azure/cost_management/delete_budget` | DELETE | destructive | Cost Management Contributor |
| `/azure/cost_management/list_exports` | GET | read | Cost Management Reader |
| `/azure/cost_management/forecast` | POST | read | Cost Management Reader |
| `/azure/cost_management/query` | POST | data | Cost Management Reader |

## ACR

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/acr/list_registries` | GET | read | Reader |
| `/azure/acr/get_registry` | GET | read | Reader |
| `/azure/acr/create_registry` | PUT | devops | AcrContributor |
| `/azure/acr/delete_registry` | DELETE | destructive | AcrContributor |
| `/azure/acr/list_repositories` | GET | read | AcrPull |
| `/azure/acr/list_tags` | GET | read | AcrPull |
| `/azure/acr/list_webhooks` | GET | read | Reader |
| `/azure/acr/push` | POST | devops | AcrPush |
| `/azure/acr/tag` | PUT | devops | AcrPush |
| `/azure/acr/delete_image` | DELETE | destructive | AcrDelete |

## Logic Apps, Service Bus, Event Hub, Event Grid

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/logic_apps/list` | GET | read | Reader |
| `/azure/logic_apps/get` | GET | read | Reader |
| `/azure/logic_apps/trigger_run` | POST | ops | Logic App Contributor |
| `/azure/logic_apps/cancel_run` | POST | destructive | Logic App Contributor |
| `/azure/logic_apps/delete` | DELETE | destructive | Logic App Contributor |
| `/azure/service_bus/list_namespaces` | GET | read | Reader |
| `/azure/service_bus/list_queues` | GET | read | Reader |
| `/azure/service_bus/list_topics` | GET | read | Reader |
| `/azure/service_bus/create_namespace` | PUT | devops | Service Bus Data Owner |
| `/azure/service_bus/delete_namespace` | DELETE | destructive | Service Bus Data Owner |
| `/azure/service_bus/create_queue` | PUT | devops | Service Bus Data Owner |
| `/azure/service_bus/delete_queue` | DELETE | destructive | Service Bus Data Owner |
| `/azure/event_hub/list_namespaces` | GET | read | Reader |
| `/azure/event_hub/list_event_hubs` | GET | read | Reader |
| `/azure/event_hub/create_event_hub` | PUT | devops | Event Hubs Data Owner |
| `/azure/event_hub/delete_event_hub` | DELETE | destructive | Event Hubs Data Owner |
| `/azure/event_grid/list_topics` | GET | read | Reader |
| `/azure/event_grid/create_topic` | PUT | devops | EventGrid Contributor |
| `/azure/event_grid/delete_topic` | DELETE | destructive | EventGrid Contributor |

## App Configuration

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/app_config/list_stores` | GET | read | Reader |
| `/azure/app_config/list_keys` | GET | read | App Configuration Data Reader |
| `/azure/app_config/get_key` | GET | read | App Configuration Data Reader |
| `/azure/app_config/set_key` | PUT | ops | App Configuration Data Owner |
| `/azure/app_config/delete_key` | DELETE | destructive | App Configuration Data Owner |

## Resource Health and Deployments

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/resource_health/get` | GET | read | Reader |
| `/azure/resource_health/list_events` | GET | read | Reader |
| `/azure/deployments/list` | GET | read | Reader |
| `/azure/deployments/get` | GET | read | Reader |
| `/azure/deployments/create` | PUT | devops | Contributor |
| `/azure/deployments/validate` | POST | read | Contributor |
| `/azure/deployments/what_if` | POST | read | Contributor |
| `/azure/deployments/cancel` | POST | destructive | Contributor |
| `/azure/deployments/delete` | DELETE | destructive | Contributor |

## Synapse and pipelines

| Command | Method | Risk | Required Azure RBAC |
|---|---|---|---|
| `/azure/synapse/query` | POST | data | Synapse Reader (workspace) |
| `/azure/pipelines/trigger` | POST | devops | Pipeline Operator |

## Escape hatch

| Command | Method | Risk | Notes |
|---|---|---|---|
| `/azure/raw_call` | any | passthrough | Any HTTP method against `management.azure.com`. Cedar policy must explicitly allow `raw_call` AND the resolved `path_prefix`. Use sparingly — bypasses the per-action schema. |

## Programmatic access to this catalog

```ts
import { actions, READS, OPS, DEVOPS, DATA, DESTRUCTIVE, actionToCommand } from '@auto-nomos/schema-packs/azure';

// All commands.
console.log(actions);          // readonly [...253 strings]

// Just destructive.
console.log(DESTRUCTIVE);      // readonly [48 strings]

// Semantic-id → command (used by MCP server and SDK).
console.log(actionToCommand.list_vms);  // "/azure/vm/list"
```

Regenerate the human-readable benchmark from prod with:

```bash
pnpm tsx scripts/azure-coverage-benchmark.mts
```

Output lands at `scripts/output/azure-coverage.{md,json}` and at
`docs/AZURE_COVERAGE.md` (legacy snapshot).
