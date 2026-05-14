/**
 * GCP schema-pack actions — M7 reads, M8 ops/devops/data + raw_call.
 */

export const READS = [
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
] as const;

export const OPS = [
  '/gcp/compute/instance_reset',
  '/gcp/compute/instance_stop',
  '/gcp/compute/instance_start',
  '/gcp/gke/cordon_node',
  '/gcp/gke/drain_node',
  '/gcp/secret_manager/rotate',
  '/gcp/cloud_run/deploy',
  '/gcp/cloud_run/restart',
  '/gcp/cloud_functions/redeploy',
] as const;

export const DEVOPS = [
  '/gcp/deployment_manager/create',
  '/gcp/cloud_build/trigger',
  '/gcp/artifact_registry/push',
  '/gcp/artifact_registry/tag',
] as const;

export const DATA = [
  '/gcp/storage/object_read',
  '/gcp/storage/object_write',
  '/gcp/bigquery/query',
  '/gcp/firestore/query',
  '/gcp/spanner/query',
] as const;

export const DESTRUCTIVE = [
  '/gcp/compute/instance_delete',
  '/gcp/storage/bucket_delete',
  '/gcp/storage/object_delete',
  '/gcp/iam/service_account_delete',
  '/gcp/gke/cluster_delete',
  '/gcp/cloud_run/service_delete',
] as const;

export const RAW_CALL = '/gcp/raw_call' as const;

export const WRITES = [...OPS, ...DEVOPS, ...DATA] as const;
export const DELETES = DESTRUCTIVE;
export const actions = [...READS, ...OPS, ...DEVOPS, ...DATA, ...DESTRUCTIVE, RAW_CALL] as const;

export const actionToCommand: Record<string, string> = {
  list_projects: '/gcp/projects/list',
  list_instances: '/gcp/compute/instances_list',
  get_instance: '/gcp/compute/instance_get',
  list_buckets: '/gcp/storage/buckets_list',
  list_objects: '/gcp/storage/objects_list',
  monitoring_time_series: '/gcp/monitoring/time_series',
  list_logs: '/gcp/logging/list',
  list_service_accounts: '/gcp/iam/service_accounts_list',
  billing_cost_query: '/gcp/billing/cost_query',
  list_cloud_run_services: '/gcp/cloud_run/services_list',
  list_gke_clusters: '/gcp/gke/clusters_list',
  list_cloudsql_instances: '/gcp/cloudsql/instances_list',
  reset_instance: '/gcp/compute/instance_reset',
  stop_instance: '/gcp/compute/instance_stop',
  start_instance: '/gcp/compute/instance_start',
  cordon_gke_node: '/gcp/gke/cordon_node',
  drain_gke_node: '/gcp/gke/drain_node',
  rotate_secret: '/gcp/secret_manager/rotate',
  deploy_cloud_run: '/gcp/cloud_run/deploy',
  restart_cloud_run: '/gcp/cloud_run/restart',
  redeploy_cloud_function: '/gcp/cloud_functions/redeploy',
  dm_create: '/gcp/deployment_manager/create',
  cloud_build_trigger: '/gcp/cloud_build/trigger',
  ar_push: '/gcp/artifact_registry/push',
  ar_tag: '/gcp/artifact_registry/tag',
  read_object: '/gcp/storage/object_read',
  write_object: '/gcp/storage/object_write',
  bigquery_query: '/gcp/bigquery/query',
  firestore_query: '/gcp/firestore/query',
  spanner_query: '/gcp/spanner/query',
  delete_instance: '/gcp/compute/instance_delete',
  delete_bucket: '/gcp/storage/bucket_delete',
  delete_object: '/gcp/storage/object_delete',
  delete_service_account: '/gcp/iam/service_account_delete',
  delete_gke_cluster: '/gcp/gke/cluster_delete',
  delete_cloud_run_service: '/gcp/cloud_run/service_delete',
  raw_call: '/gcp/raw_call',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const projectId = typeof params.project_id === 'string' ? params.project_id : undefined;
  const region = typeof params.region === 'string' ? params.region : undefined;
  const resourceName = typeof params.name === 'string' ? params.name : undefined;
  const zone = typeof params.zone === 'string' ? params.zone : undefined;

  const base: Record<string, unknown> = {};
  if (projectId) base.project_id = projectId;
  if (region) base.region = region;
  if (resourceName) base.name = resourceName;
  if (zone) base.zone = zone;

  if (actionId === 'raw_call') {
    return {
      ...base,
      method: typeof params.method === 'string' ? params.method : undefined,
      host: typeof params.host === 'string' ? params.host : undefined,
      path: typeof params.path === 'string' ? params.path : undefined,
      path_prefix: typeof params.path_prefix === 'string' ? params.path_prefix : undefined,
    };
  }
  return base;
}
