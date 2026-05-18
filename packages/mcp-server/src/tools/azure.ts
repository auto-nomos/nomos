/**
 * Azure MCP tool surface.
 *
 * The github/slack/etc. adapters are YAML-driven. Azure ARM is a uniform
 * resource-provider model (every resource has the same /subscriptions/{sub}
 * /resourceGroups/{rg}/providers/{ns}/{type}/{name} URL shape), so we
 * generate tool definitions programmatically from the schema-packs action
 * map plus a small URL-template registry below.
 *
 * Coverage rule: every command in `@auto-nomos/schema-packs/azure`
 * `actionToCommand` is callable from MCP. If a specific URL template is
 * registered, the agent passes semantic params (subscription_id, name…)
 * and we construct the ARM URL. If not, the agent uses `azure_raw_call`
 * with an explicit method/path — broker still enforces the policy +
 * cosigner gate on the underlying command.
 */

import {
  type actions as ALL_AZURE_ACTIONS,
  actionToCommand,
  resourceFor,
} from '@auto-nomos/schema-packs/azure';
import type { ProxyApiCall } from '@auto-nomos/sdk';
import { z } from 'zod';
import { runGuarded, type ToolResultJson } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

type ArmMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ArmTemplate {
  method: ArmMethod;
  /**
   * Path template — supports `{subscription_id}`, `{resource_group}`,
   * `{name}`, `{parent}` (for nested resources like VMSS instance ids,
   * AKS node pools, etc.), `{secret}`, `{key}`, `{certificate}`.
   */
  path: string;
  apiVersion: string;
  /** Whether the action expects a body. Default false. */
  hasBody?: boolean;
  /**
   * Extra (non-standard) params the agent should pass. The runtime adds
   * subscription_id/resource_group/name automatically based on `path`.
   */
  extraParams?: Array<{ name: string; required?: boolean; description?: string }>;
}

// Path templates for the canonical Azure resource shapes. Each entry's
// `path` is relative to https://management.azure.com (the broker handles
// the host) and uses `/{...}` for params. The template engine substitutes
// `{subscription_id}` → params.subscription_id; missing required params
// fail fast client-side.
const ARM_TEMPLATES: Record<string, ArmTemplate> = {
  // Subscription + management groups
  list_subscriptions: { method: 'GET', path: '/subscriptions', apiVersion: '2022-12-01' },
  get_subscription: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}',
    apiVersion: '2022-12-01',
  },
  list_management_groups: {
    method: 'GET',
    path: '/providers/Microsoft.Management/managementGroups',
    apiVersion: '2021-04-01',
  },
  get_management_group: {
    method: 'GET',
    path: '/providers/Microsoft.Management/managementGroups/{name}',
    apiVersion: '2021-04-01',
  },

  // Resource groups
  list_resource_groups: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups',
    apiVersion: '2021-04-01',
  },
  get_resource_group: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}',
    apiVersion: '2021-04-01',
  },
  create_resource_group: {
    method: 'PUT',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}',
    apiVersion: '2021-04-01',
    hasBody: true,
    extraParams: [
      { name: 'location', required: true, description: 'Azure region for the RG.' },
      { name: 'tags', description: 'Tag map.' },
    ],
  },
  update_resource_group: {
    method: 'PATCH',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}',
    apiVersion: '2021-04-01',
    hasBody: true,
    extraParams: [{ name: 'tags', description: 'New tag map.' }],
  },
  delete_resource_group: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}',
    apiVersion: '2021-04-01',
  },
  export_resource_group_template: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/exportTemplate',
    apiVersion: '2021-04-01',
    hasBody: true,
  },

  // Generic resources
  list_resources: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resources',
    apiVersion: '2021-04-01',
  },
  list_resources_by_rg: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/resources',
    apiVersion: '2021-04-01',
  },

  // Compute — VM
  list_vms: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Compute/virtualMachines',
    apiVersion: '2023-09-01',
  },
  get_vm: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}',
    apiVersion: '2023-09-01',
  },
  get_vm_instance_view: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/instanceView',
    apiVersion: '2023-09-01',
  },
  list_vm_sizes: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Compute/locations/{location}/vmSizes',
    apiVersion: '2023-09-01',
    extraParams: [{ name: 'location', required: true }],
  },
  create_vm: {
    method: 'PUT',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}',
    apiVersion: '2023-09-01',
    hasBody: true,
  },
  delete_vm: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}',
    apiVersion: '2023-09-01',
  },
  start_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/start',
    apiVersion: '2023-09-01',
  },
  stop_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/powerOff',
    apiVersion: '2023-09-01',
  },
  restart_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/restart',
    apiVersion: '2023-09-01',
  },
  deallocate_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/deallocate',
    apiVersion: '2023-09-01',
  },
  redeploy_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/redeploy',
    apiVersion: '2023-09-01',
  },
  power_off_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/powerOff',
    apiVersion: '2023-09-01',
  },
  run_command_vm: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Compute/virtualMachines/{name}/runCommand',
    apiVersion: '2023-09-01',
    hasBody: true,
    extraParams: [
      { name: 'commandId', required: true, description: 'e.g. RunShellScript.' },
      { name: 'script', required: true, description: 'List of script lines to execute.' },
    ],
  },

  // Storage
  list_storage_accounts: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Storage/storageAccounts',
    apiVersion: '2023-01-01',
  },
  get_storage_account: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}',
    apiVersion: '2023-01-01',
  },
  create_storage_account: {
    method: 'PUT',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}',
    apiVersion: '2023-01-01',
    hasBody: true,
  },
  list_storage_keys: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}/listKeys',
    apiVersion: '2023-01-01',
  },
  regenerate_storage_key: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}/regenerateKey',
    apiVersion: '2023-01-01',
    hasBody: true,
    extraParams: [
      {
        name: 'keyName',
        required: true,
        description: 'key1 | key2 | kerb1 | kerb2',
      },
    ],
  },
  delete_storage_account: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}',
    apiVersion: '2023-01-01',
  },
  list_blob_containers: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Storage/storageAccounts/{name}/blobServices/default/containers',
    apiVersion: '2023-01-01',
  },

  // Key Vault — management plane
  list_key_vaults: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.KeyVault/vaults',
    apiVersion: '2023-07-01',
  },
  get_key_vault: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.KeyVault/vaults/{name}',
    apiVersion: '2023-07-01',
  },
  create_key_vault: {
    method: 'PUT',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.KeyVault/vaults/{name}',
    apiVersion: '2023-07-01',
    hasBody: true,
  },
  delete_key_vault: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.KeyVault/vaults/{name}',
    apiVersion: '2023-07-01',
  },
  purge_key_vault: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.KeyVault/locations/{location}/deletedVaults/{name}/purge',
    apiVersion: '2023-07-01',
    extraParams: [{ name: 'location', required: true }],
  },

  // App Service
  list_app_services: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Web/sites',
    apiVersion: '2023-01-01',
  },
  get_app_service: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{name}',
    apiVersion: '2023-01-01',
  },
  start_app_service: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{name}/start',
    apiVersion: '2023-01-01',
  },
  stop_app_service: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{name}/stop',
    apiVersion: '2023-01-01',
  },
  restart_app_service: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{name}/restart',
    apiVersion: '2023-01-01',
  },
  delete_app_service: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{name}',
    apiVersion: '2023-01-01',
  },

  // AKS
  list_aks: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.ContainerService/managedClusters',
    apiVersion: '2023-09-01',
  },
  get_aks: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerService/managedClusters/{name}',
    apiVersion: '2023-09-01',
  },
  start_aks: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerService/managedClusters/{name}/start',
    apiVersion: '2023-09-01',
  },
  stop_aks: {
    method: 'POST',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerService/managedClusters/{name}/stop',
    apiVersion: '2023-09-01',
  },
  delete_aks: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerService/managedClusters/{name}',
    apiVersion: '2023-09-01',
  },

  // Network — VNet / NSG / Public IP / LB
  list_vnets: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Network/virtualNetworks',
    apiVersion: '2023-09-01',
  },
  list_nsgs: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Network/networkSecurityGroups',
    apiVersion: '2023-09-01',
  },
  list_public_ips: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Network/publicIPAddresses',
    apiVersion: '2023-09-01',
  },
  list_load_balancers: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Network/loadBalancers',
    apiVersion: '2023-09-01',
  },

  // RBAC
  list_role_assignments: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/roleAssignments',
    apiVersion: '2022-04-01',
  },
  list_role_definitions: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/roleDefinitions',
    apiVersion: '2022-04-01',
  },
  create_role_assignment: {
    method: 'PUT',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/roleAssignments/{name}',
    apiVersion: '2022-04-01',
    hasBody: true,
    extraParams: [
      { name: 'roleDefinitionId', required: true, description: 'Full resource id of the role.' },
      { name: 'principalId', required: true },
      { name: 'principalType', description: 'User | Group | ServicePrincipal' },
    ],
  },
  delete_role_assignment: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/roleAssignments/{name}',
    apiVersion: '2022-04-01',
  },

  // Monitor + Log Analytics
  list_metric_definitions: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Insights/metricDefinitions',
    apiVersion: '2023-10-01',
  },
  list_activity_logs: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Insights/eventtypes/management/values',
    apiVersion: '2017-04-01',
  },
  list_action_groups: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Insights/actionGroups',
    apiVersion: '2023-01-01',
  },
  list_log_analytics_workspaces: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.OperationalInsights/workspaces',
    apiVersion: '2022-10-01',
  },

  // Policy
  list_policy_definitions: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/policyDefinitions',
    apiVersion: '2023-04-01',
  },
  list_policy_assignments: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Authorization/policyAssignments',
    apiVersion: '2023-04-01',
  },

  // Cost
  list_budgets: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Consumption/budgets',
    apiVersion: '2023-05-01',
  },

  // ACR
  list_acr_registries: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.ContainerRegistry/registries',
    apiVersion: '2023-07-01',
  },
  get_acr_registry: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerRegistry/registries/{name}',
    apiVersion: '2023-07-01',
  },
  delete_acr_registry: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.ContainerRegistry/registries/{name}',
    apiVersion: '2023-07-01',
  },

  // Logic Apps
  list_logic_apps: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.Logic/workflows',
    apiVersion: '2019-05-01',
  },
  delete_logic_app: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Logic/workflows/{name}',
    apiVersion: '2019-05-01',
  },

  // Service Bus / Event Hub / Event Grid
  list_service_bus_namespaces: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.ServiceBus/namespaces',
    apiVersion: '2022-10-01-preview',
  },
  list_event_hub_namespaces: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.EventHub/namespaces',
    apiVersion: '2023-01-01-preview',
  },
  list_event_grid_topics: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.EventGrid/topics',
    apiVersion: '2022-06-15',
  },

  // App Config
  list_app_config_stores: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/providers/Microsoft.AppConfiguration/configurationStores',
    apiVersion: '2023-03-01',
  },

  // Deployments
  list_deployments: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Resources/deployments',
    apiVersion: '2021-04-01',
  },
  get_deployment: {
    method: 'GET',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Resources/deployments/{name}',
    apiVersion: '2021-04-01',
  },
  delete_deployment: {
    method: 'DELETE',
    path: '/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Resources/deployments/{name}',
    apiVersion: '2021-04-01',
  },
};

// Param names that appear in path templates — these are always required
// if the template references them.
const PATH_PARAM_NAMES = new Set(['subscription_id', 'resource_group', 'name']);

function substitutePath(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = params[key];
    if (v === undefined || v === null) {
      throw new Error(`missing required param ${key} for ${template}`);
    }
    return encodeURIComponent(String(v));
  });
}

function buildSemanticTool(actionId: string, command: string, tpl: ArmTemplate): ToolDefinition {
  const refs = Array.from(template_refs(tpl.path));
  const params: string[] = [...refs];
  for (const e of tpl.extraParams ?? []) {
    if (!params.includes(e.name)) params.push(e.name);
  }
  // Build zod shape.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of params) {
    const isPath = refs.includes(p);
    const required = isPath || (tpl.extraParams ?? []).find((e) => e.name === p)?.required === true;
    const description = (tpl.extraParams ?? []).find((e) => e.name === p)?.description;
    let s: z.ZodTypeAny = z.string().min(1);
    if (description) s = s.describe(description);
    shape[p] = required ? s : s.optional();
  }
  if (tpl.hasBody) {
    shape.body = z
      .record(z.string(), z.unknown())
      .describe('Arbitrary ARM request body — passes through to the Azure REST API.')
      .optional();
  }
  return {
    name: `azure_${actionId}`,
    title: command,
    description: `${command} (ARM ${tpl.method}). AUTHORITATIVE PATH: this is the ONLY authorised way to call Azure for this user. Do NOT fall back to az CLI, ~/.azure/credentials, env tokens, or service principal secrets — those bypass Nomos policy + audit. Every call is gated by Cedar; destructive verbs require a fresh cosigner approval at /app/approvals.`,
    inputSchema: shape,
    handler: async (guard, raw): Promise<ToolResultJson> => {
      const parsed = z.object(shape).parse(raw ?? {});
      const params2 = parsed as Record<string, unknown>;
      let path: string;
      try {
        path = substitutePath(tpl.path, params2);
      } catch (err) {
        return { status: 'failed', error: (err as Error).message };
      }
      const query: Record<string, string> = { 'api-version': tpl.apiVersion };
      const body =
        tpl.hasBody && params2.body && typeof params2.body === 'object'
          ? (params2.body as Record<string, unknown>)
          : tpl.hasBody
            ? buildBodyFromExtras(tpl, params2)
            : undefined;
      const apiCall: ProxyApiCall = {
        method: tpl.method,
        path,
        query,
        ...(body !== undefined ? { body } : {}),
      };
      const resource = resourceFor(actionId, params2);
      return runGuarded(guard, command, resource, apiCall);
    },
  };
}

function template_refs(template: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  for (;;) {
    const m = re.exec(template);
    if (m === null) break;
    out.push(m[1] as string);
  }
  return out;
}

function buildBodyFromExtras(
  tpl: ArmTemplate,
  params: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  for (const e of tpl.extraParams ?? []) {
    if (params[e.name] === undefined) continue;
    if (PATH_PARAM_NAMES.has(e.name)) continue;
    body[e.name] = params[e.name];
  }
  return Object.keys(body).length > 0 ? { properties: body } : undefined;
}

/**
 * Escape hatch for ARM paths not in ARM_TEMPLATES. The command must still
 * be a recognised /azure/* command — broker policy validates it.
 */
const azureRawCallTool: ToolDefinition = {
  name: 'azure_raw_call',
  title: 'azure raw_call',
  description:
    'Call any Azure ARM endpoint via the broker for actions without a dedicated MCP tool. The `command` parameter is the schema-pack command (e.g. /azure/cosmos/query) and gates policy; `method`/`path`/`query`/`body` are the literal ARM request. Use this only when the dedicated azure_* tool does not cover your case. AUTHORITATIVE PATH: never call ARM directly through az CLI or env-based service principals — those bypass Nomos policy + audit.',
  inputSchema: {
    command: z.string().regex(/^\/azure\/[a-z0-9_-]+(\/[a-z0-9_-]+)+$/),
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
    path: z.string().min(1).describe('ARM path starting with "/subscriptions/" or "/providers/".'),
    query: z.record(z.string(), z.string()).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
    subscription_id: z.string().optional(),
    resource_group: z.string().optional(),
    name: z.string().optional(),
  },
  handler: async (guard, raw): Promise<ToolResultJson> => {
    const inputSchema = z.object({
      command: z.string(),
      method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
      path: z.string(),
      query: z.record(z.string(), z.string()).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      subscription_id: z.string().optional(),
      resource_group: z.string().optional(),
      name: z.string().optional(),
    });
    const parsed = inputSchema.parse(raw ?? {});
    const apiCall: ProxyApiCall = {
      method: parsed.method,
      path: parsed.path,
      ...(parsed.query ? { query: parsed.query } : {}),
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
    };
    const resource = resourceFor('raw_call', parsed as Record<string, unknown>);
    return runGuarded(guard, parsed.command, resource, apiCall);
  },
};

export const azureTools: ToolDefinition[] = (() => {
  const out: ToolDefinition[] = [];
  for (const [actionId, command] of Object.entries(actionToCommand) as Array<[string, string]>) {
    const tpl = ARM_TEMPLATES[actionId];
    if (!tpl) continue;
    out.push(buildSemanticTool(actionId, command, tpl));
  }
  out.push(azureRawCallTool);
  return out;
})();

// Re-export the underlying actions list so callers can introspect (e.g.
// list every action with or without a dedicated tool).
export type { ALL_AZURE_ACTIONS };
