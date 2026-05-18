# Azure broker coverage

Generated 2026-05-18T14:10:41.737Z against https://pdp.auto-nomos.com.

## Summary

| Metric | Value |
|---|---|
| Total actions registered | 253 |
| Recognised by PDP | 253 |
| UCAN minted successfully | 252 |
| Broker forwarded to ARM (Cedar allowed, federation handshake completed) | 172 |
| └─ ARM 2xx | 36 |
| └─ ARM 4xx (Reader role limit or resource absent — broker did its job) | 136 |
| Cosigner-gated by risk rules | 73 |
| Schema violation (rejected pre-Cedar) | 0 |
| PDP deny (Cedar-level) | 7 |
| Destructive actions with correct cosigner gate | 73 / 48 |

## Per-action results

| Command | Class | Schema | Mint | ARM | Cosigner | Notes |
|---|---|---|---|---|---|---|
| `/azure/subscriptions/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/subscriptions/get` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/management_groups/list` | read | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/management_groups/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resource_groups/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/resource_groups/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resource_groups/export_template` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/resources/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/resources/list_by_rg` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resources/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vm/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/vm/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vm/get_instance_view` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vm/list_available_sizes` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/vm/list_extensions` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vm/list_disks` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vmss/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/vmss/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/disks/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/disks/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/images/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/snapshots/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/storage_accounts/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/storage_accounts/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/storage_accounts/list_keys` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/blob_containers/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/blob_containers/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/file_shares/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/queues/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/tables/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/key_vaults/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/list_secrets` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/get_secret` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/list_keys` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/get_key` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/list_certificates` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/key_vaults/get_certificate` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/app_services/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/app_services/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/app_services/list_app_settings` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/app_services/list_slots` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/functions/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/functions/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/aks/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/aks/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/aks/list_node_pools` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/aks/get_kubeconfig` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cosmos/list_accounts` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/cosmos/get_account` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cosmos/list_databases` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cosmos/list_containers` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cosmos/list_keys` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/vnets/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/vnets/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/subnets/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/nsgs/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/nsgs/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/public_ips/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/load_balancers/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/load_balancers/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/application_gateways/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/private_endpoints/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/dns_zones/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/dns_zones/list_records` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/rbac/list_role_assignments` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/rbac/get_role_assignment` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/rbac/list_role_definitions` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/monitor/list_alerts` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/monitor/list_metric_definitions` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/monitor/list_diagnostic_settings` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/monitor/list_activity_logs` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/monitor/list_action_groups` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/log_analytics/list_workspaces` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/metrics/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/tags/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/locks/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/policy/list_definitions` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/policy/list_assignments` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/policy/list_compliance_states` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cost_management/list_budgets` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cost_management/list_exports` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cost_management/forecast` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/acr/list_registries` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/acr/get_registry` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/acr/list_repositories` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/acr/list_tags` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/acr/list_webhooks` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/logic_apps/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/logic_apps/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/service_bus/list_namespaces` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/service_bus/list_queues` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/service_bus/list_topics` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/event_hub/list_namespaces` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/event_hub/list_event_hubs` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/event_grid/list_topics` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/app_config/list_stores` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/app_config/list_keys` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/app_config/get_key` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resource_health/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resource_health/list_events` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/deployments/list` | read | ok | ok | 200 ✓ | — | ARM 200 |
| `/azure/deployments/get` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/deployments/validate` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/deployments/what_if` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/vm/restart` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vm/stop` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/start` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vm/deallocate` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/redeploy` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/power_off` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/run_command` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/capture` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/install_extension` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vm/attach_disk` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vm/detach_disk` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vmss/scale` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vmss/restart` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vmss/reimage` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vmss/upgrade_instances` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/aks/start` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/aks/stop` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/rotate_certificates` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/run_command` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/cordon_node` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/aks/drain_node` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/scale_node_pool` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/upgrade_node_pool` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/storage_accounts/regenerate_key` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/blob_containers/lease` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/blob_containers/set_acl` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/key_vaults/rotate_secret` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/update_policy` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/app_services/redeploy` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/app_services/restart` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/app_services/stop` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/app_services/start` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/app_services/update_app_settings` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/app_services/slot_swap` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/functions/invoke` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cosmos/regenerate_key` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/nsgs/add_rule` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/dns_zones/create_record` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/rbac/create_role_assignment` | non_destructive_write | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/rbac/create_role_definition` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/monitor/create_diagnostic_setting` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/monitor/create_alert_rule` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/tags/set` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/locks/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/policy/create_assignment` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cost_management/create_budget` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/logic_apps/trigger_run` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/logic_apps/cancel_run` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/app_config/set_key` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/deployments/cancel` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/resource_groups/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/resource_groups/update` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/resources/move` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/resources/tag` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vm/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/disks/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/snapshots/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/storage_accounts/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/storage_accounts/update` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/blob_containers/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/file_shares/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/queues/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/tables/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/key_vaults/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/key_vaults/set_secret` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/key_vaults/create_key` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/key_vaults/create_certificate` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/app_services/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/aks/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/aks/update` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cosmos/create_account` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cosmos/create_database` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cosmos/create_container` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/vnets/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/subnets/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/nsgs/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/public_ips/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/load_balancers/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/service_bus/create_namespace` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/service_bus/create_queue` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/event_hub/create_event_hub` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/event_grid/create_topic` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/log_analytics/create_workspace` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/deployments/create` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/acr/create_registry` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/acr/push` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/acr/tag` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/pipelines/trigger` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/blob/read` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/blob/write` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/blob/list` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/blob/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cosmos/query` | read | ok | ok | — | — | PDP deny: schema_violation |
| `/azure/cosmos/create_item` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cosmos/get_item` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/cosmos/delete_item` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/synapse/query` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/log_analytics/kql` | non_destructive_write | ok | ok | 403 | — | broker→ARM 403 (Reader role limit or resource absent) |
| `/azure/cost_management/query` | read | ok | ok | 404 | — | broker→ARM 404 (Reader role limit or resource absent) |
| `/azure/resource_groups/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/resources/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vm/uninstall_extension` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vmss/delete_instance` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vmss/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/disks/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/snapshots/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/storage_accounts/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/blob_containers/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/file_shares/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/queues/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/tables/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/delete_secret` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/delete_key` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/delete_certificate` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/key_vaults/purge` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/app_services/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/functions/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/aks/delete_node_pool` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cosmos/delete_account` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cosmos/delete_database` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cosmos/delete_container` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/vnets/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/subnets/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/nsgs/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/nsgs/remove_rule` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/public_ips/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/load_balancers/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/dns_zones/delete_record` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/rbac/delete_role_assignment` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/tags/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/locks/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/policy/delete_assignment` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/monitor/delete_alert_rule` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/cost_management/delete_budget` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/logic_apps/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/service_bus/delete_namespace` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/service_bus/delete_queue` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/event_hub/delete_event_hub` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/event_grid/delete_topic` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/app_config/delete_key` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/acr/delete_image` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/acr/delete_registry` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/log_analytics/delete_workspace` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/deployments/delete` | destructive | ok | ok | — | yes | cosigner_required (expected for destructive) |
| `/azure/raw_call` | non_destructive_write | ok | — | — | — | skipped (raw_call) |