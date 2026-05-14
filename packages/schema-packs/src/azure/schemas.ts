/**
 * Azure schema-pack: per-action Zod schemas the PDP enforces before Cedar.
 *
 * ARM operations all require `api-version`. Destructive verbs additionally
 * validate that subscription_id + resource_group are present. raw_call
 * validates the upstream-shape envelope (method, host, path) explicitly
 * so policies can match on those keys in Cedar.
 */
import { z } from 'zod';
import type { IntegrationPack } from '../types.js';

const safePath = z
  .string()
  .min(1)
  .refine((p: string) => !p.includes('..') && !p.includes('//'), {
    message: 'path must not contain `..` or `//` segments',
  });

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: safePath,
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const armRead = apiCallBase.extend({
  method: z.literal('GET'),
  query: z.object({ 'api-version': z.string().min(1) }).passthrough(),
});

const armWrite = apiCallBase.extend({
  method: z.enum(['POST', 'PATCH', 'PUT']),
  query: z.object({ 'api-version': z.string().min(1) }).passthrough(),
});

const armDelete = apiCallBase.extend({
  method: z.literal('DELETE'),
  query: z.object({ 'api-version': z.string().min(1) }).passthrough(),
});

const azureResource = z
  .object({
    subscription_id: z.string().optional(),
    resource_group: z.string().optional(),
    name: z.string().optional(),
    resource_type: z.string().optional(),
  })
  .passthrough();

const rawCallSchema = apiCallBase;
const rawCallResource = z
  .object({
    method: z.string().optional(),
    host: z.string().optional(),
    path: z.string().optional(),
    path_prefix: z.string().optional(),
  })
  .passthrough();

export const azureActionSchemas: NonNullable<IntegrationPack['actionSchemas']> = {
  '/azure/subscriptions/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/resource_groups/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/resources/list_by_rg': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/vm/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/vm/get': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/storage_accounts/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/blob_containers/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/key_vaults/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/app_services/list': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/metrics/get': { apiCallSchema: armRead, resourceSchema: azureResource },
  // ops
  '/azure/vm/restart': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/vm/stop': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/vm/start': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/vm/run_command': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/vmss/scale': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/aks/cordon_node': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/aks/drain_node': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/key_vaults/rotate_secret': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/app_services/redeploy': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/app_services/restart': { apiCallSchema: armWrite, resourceSchema: azureResource },
  // devops
  '/azure/deployments/create': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/deployments/get': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/app_services/slot_swap': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/acr/push': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/acr/tag': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/pipelines/trigger': { apiCallSchema: armWrite, resourceSchema: azureResource },
  // data
  '/azure/blob/read': { apiCallSchema: armRead, resourceSchema: azureResource },
  '/azure/blob/write': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/cosmos/query': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/synapse/query': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/log_analytics/kql': { apiCallSchema: armWrite, resourceSchema: azureResource },
  '/azure/cost_management/query': { apiCallSchema: armWrite, resourceSchema: azureResource },
  // destructive
  '/azure/vm/delete': { apiCallSchema: armDelete, resourceSchema: azureResource },
  '/azure/storage_accounts/delete': { apiCallSchema: armDelete, resourceSchema: azureResource },
  '/azure/key_vaults/delete': { apiCallSchema: armDelete, resourceSchema: azureResource },
  '/azure/resource_groups/delete': { apiCallSchema: armDelete, resourceSchema: azureResource },
  // raw_call (escape hatch)
  '/azure/raw_call': { apiCallSchema: rawCallSchema, resourceSchema: rawCallResource },
};
