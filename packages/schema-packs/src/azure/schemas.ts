/**
 * Azure schema-pack: per-action Zod schemas the PDP enforces before Cedar.
 *
 * Schemas are derived from the action arrays in `actions.ts` to avoid drift.
 * Reads → armRead, ops/devops/destructive → armWrite/armDelete based on
 * the array they belong to. raw_call has a permissive schema.
 *
 * If you need a tighter body shape for one specific action (e.g.
 * /azure/rbac/create_role_assignment) wire a custom entry in
 * `customSchemas` below; the default registration loop will skip it.
 */
import { z } from 'zod';
import type { IntegrationPack } from '../types.js';
import { DATA, DESTRUCTIVE, DEVOPS, OPS, RAW_CALL, READS } from './actions.js';

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

// Data-plane calls don't always pass through ARM (blob/cosmos can hit
// the storage endpoint directly). Looser schema; still requires query
// to be string→string when present.
const dataPlane = apiCallBase;

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

type SchemaEntry = NonNullable<IntegrationPack['actionSchemas']>[string];

/**
 * Custom schemas for actions whose body shape we want to enforce more
 * strictly than the default armWrite/armDelete. Keep this small — most
 * Azure operations are happy with the generic ARM wrapper because the
 * PDP only needs to reject obviously malformed inputs (Cedar policy +
 * upstream ARM do the real validation).
 */
const customSchemas: Record<string, SchemaEntry> = {
  [RAW_CALL]: { apiCallSchema: rawCallSchema, resourceSchema: rawCallResource },
  // RBAC create — body requires roleDefinitionId + principalId per ARM.
  '/azure/rbac/create_role_assignment': {
    apiCallSchema: armWrite.extend({
      body: z
        .object({
          properties: z
            .object({
              roleDefinitionId: z.string().min(1),
              principalId: z.string().min(1),
              principalType: z.string().optional(),
            })
            .passthrough(),
        })
        .passthrough(),
    }),
    resourceSchema: azureResource,
  },
  // NSG add_rule — body requires properties.access ∈ Allow|Deny + direction.
  '/azure/nsgs/add_rule': {
    apiCallSchema: armWrite.extend({
      body: z
        .object({
          properties: z
            .object({
              access: z.enum(['Allow', 'Deny']),
              direction: z.enum(['Inbound', 'Outbound']),
              priority: z.number().int().min(100).max(4096),
              protocol: z.string().min(1),
            })
            .passthrough(),
        })
        .passthrough(),
    }),
    resourceSchema: azureResource,
  },
  // Cosmos data-plane query — POST with body.query; looser ARM contract.
  '/azure/cosmos/query': {
    apiCallSchema: dataPlane.extend({
      method: z.literal('POST'),
      body: z.object({ query: z.string().min(1) }).passthrough(),
    }),
    resourceSchema: azureResource,
  },
  '/azure/log_analytics/kql': {
    apiCallSchema: dataPlane.extend({
      method: z.literal('POST'),
      body: z.object({ query: z.string().min(1) }).passthrough(),
    }),
    resourceSchema: azureResource,
  },
};

function buildSchemas(): NonNullable<IntegrationPack['actionSchemas']> {
  const out: NonNullable<IntegrationPack['actionSchemas']> = {};
  function add(command: string, schemaKind: 'read' | 'write' | 'delete' | 'data'): void {
    if (customSchemas[command]) {
      out[command] = customSchemas[command]!;
      return;
    }
    const apiCallSchema =
      schemaKind === 'read'
        ? armRead
        : schemaKind === 'delete'
          ? armDelete
          : schemaKind === 'data'
            ? dataPlane
            : armWrite;
    out[command] = { apiCallSchema, resourceSchema: azureResource };
  }
  for (const c of READS) add(c, 'read');
  for (const c of OPS) add(c, 'write');
  for (const c of DEVOPS) add(c, 'write');
  for (const c of DATA) add(c, 'data');
  for (const c of DESTRUCTIVE) add(c, 'delete');
  // raw_call already in customSchemas; pick it up.
  out[RAW_CALL] = customSchemas[RAW_CALL]!;
  return out;
}

export const azureActionSchemas: NonNullable<IntegrationPack['actionSchemas']> = buildSchemas();
