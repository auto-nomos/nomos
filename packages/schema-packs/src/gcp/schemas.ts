import { z } from 'zod';
import type { IntegrationPack } from '../types.js';

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().min(1),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const read = apiCallBase.extend({ method: z.enum(['GET', 'POST']) });
const write = apiCallBase.extend({ method: z.enum(['POST', 'PATCH', 'PUT']) });
const deleteCall = apiCallBase.extend({ method: z.literal('DELETE') });

const gcpResource = z
  .object({
    project_id: z.string().optional(),
    region: z.string().optional(),
    zone: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const rawCallResource = z
  .object({
    method: z.string().optional(),
    host: z.string().optional(),
    path: z.string().optional(),
    path_prefix: z.string().optional(),
  })
  .passthrough();

const r = (cmds: readonly string[]) =>
  Object.fromEntries(
    cmds.map((cmd) => [cmd, { apiCallSchema: read, resourceSchema: gcpResource }]),
  );
const w = (cmds: readonly string[]) =>
  Object.fromEntries(
    cmds.map((cmd) => [cmd, { apiCallSchema: write, resourceSchema: gcpResource }]),
  );
const d = (cmds: readonly string[]) =>
  Object.fromEntries(
    cmds.map((cmd) => [cmd, { apiCallSchema: deleteCall, resourceSchema: gcpResource }]),
  );

export const gcpActionSchemas: NonNullable<IntegrationPack['actionSchemas']> = {
  ...r([
    '/gcp/projects/list',
    '/gcp/compute/instances_list',
    '/gcp/compute/instance_get',
    '/gcp/storage/buckets_list',
    '/gcp/storage/objects_list',
    '/gcp/monitoring/time_series',
    '/gcp/logging/list',
    '/gcp/iam/service_accounts_list',
    '/gcp/billing/cost_query',
    '/gcp/cloud_run/services_list',
    '/gcp/gke/clusters_list',
    '/gcp/cloudsql/instances_list',
    '/gcp/storage/object_read',
  ]),
  ...w([
    '/gcp/compute/instance_reset',
    '/gcp/compute/instance_stop',
    '/gcp/compute/instance_start',
    '/gcp/gke/cordon_node',
    '/gcp/gke/drain_node',
    '/gcp/secret_manager/rotate',
    '/gcp/cloud_run/deploy',
    '/gcp/cloud_run/restart',
    '/gcp/cloud_functions/redeploy',
    '/gcp/deployment_manager/create',
    '/gcp/cloud_build/trigger',
    '/gcp/artifact_registry/push',
    '/gcp/artifact_registry/tag',
    '/gcp/storage/object_write',
    '/gcp/bigquery/query',
    '/gcp/firestore/query',
    '/gcp/spanner/query',
  ]),
  ...d([
    '/gcp/compute/instance_delete',
    '/gcp/storage/bucket_delete',
    '/gcp/storage/object_delete',
    '/gcp/iam/service_account_delete',
    '/gcp/gke/cluster_delete',
    '/gcp/cloud_run/service_delete',
  ]),
  '/gcp/raw_call': { apiCallSchema: apiCallBase, resourceSchema: rawCallResource },
};
