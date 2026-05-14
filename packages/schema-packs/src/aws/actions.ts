/**
 * AWS schema-pack actions — M5 reads, M6 ops/devops/data + raw_call.
 *
 * AWS service surface is enormous (14k+ native IAM actions); we curate
 * the ~50 highest-value agent ops and expose raw_call for the long tail.
 * Cedar action ids are namespaced `/aws/<service>/<verb>`.
 */

export const READS = [
  '/aws/ec2/list_instances',
  '/aws/ec2/describe_instance',
  '/aws/s3/list_buckets',
  '/aws/s3/list_objects',
  '/aws/cloudwatch/get_metric',
  '/aws/cloudwatch/get_logs',
  '/aws/lambda/list',
  '/aws/lambda/get',
  '/aws/iam/list_users',
  '/aws/iam/list_roles',
  '/aws/ce/get_cost_and_usage',
  '/aws/rds/describe_instances',
  '/aws/ecs/list_clusters',
  '/aws/eks/list_clusters',
  '/aws/cloudformation/list_stacks',
] as const;

export const OPS = [
  '/aws/ec2/restart_instance',
  '/aws/ec2/stop_instance',
  '/aws/ec2/start_instance',
  '/aws/ec2/run_command',
  '/aws/asg/scale',
  '/aws/eks/cordon_node',
  '/aws/eks/drain_node',
  '/aws/secretsmanager/rotate_secret',
  '/aws/lambda/invoke',
  '/aws/lambda/redeploy',
  '/aws/ecs/restart_service',
] as const;

export const DEVOPS = [
  '/aws/cloudformation/create_stack',
  '/aws/cloudformation/update_stack',
  '/aws/codepipeline/trigger',
  '/aws/ecr/push',
  '/aws/ecr/tag',
  '/aws/lambda/update_function',
] as const;

export const DATA = [
  '/aws/s3/get_object',
  '/aws/s3/put_object',
  '/aws/dynamodb/query',
  '/aws/dynamodb/scan',
  '/aws/athena/query',
  '/aws/redshift/query',
] as const;

export const DESTRUCTIVE = [
  '/aws/ec2/terminate_instance',
  '/aws/s3/delete_bucket',
  '/aws/s3/delete_object',
  '/aws/lambda/delete',
  '/aws/cloudformation/delete_stack',
  '/aws/iam/delete_user',
  '/aws/iam/delete_role',
] as const;

export const RAW_CALL = '/aws/raw_call' as const;

export const WRITES = [...OPS, ...DEVOPS, ...DATA] as const;
export const DELETES = DESTRUCTIVE;
export const actions = [...READS, ...OPS, ...DEVOPS, ...DATA, ...DESTRUCTIVE, RAW_CALL] as const;

export const actionToCommand: Record<string, string> = {
  // reads
  list_instances: '/aws/ec2/list_instances',
  describe_instance: '/aws/ec2/describe_instance',
  list_buckets: '/aws/s3/list_buckets',
  list_objects: '/aws/s3/list_objects',
  get_cloudwatch_metric: '/aws/cloudwatch/get_metric',
  get_cloudwatch_logs: '/aws/cloudwatch/get_logs',
  list_lambdas: '/aws/lambda/list',
  get_lambda: '/aws/lambda/get',
  list_iam_users: '/aws/iam/list_users',
  list_iam_roles: '/aws/iam/list_roles',
  get_cost_and_usage: '/aws/ce/get_cost_and_usage',
  describe_rds_instances: '/aws/rds/describe_instances',
  list_ecs_clusters: '/aws/ecs/list_clusters',
  list_eks_clusters: '/aws/eks/list_clusters',
  list_stacks: '/aws/cloudformation/list_stacks',
  // ops
  restart_instance: '/aws/ec2/restart_instance',
  stop_instance: '/aws/ec2/stop_instance',
  start_instance: '/aws/ec2/start_instance',
  run_command_ec2: '/aws/ec2/run_command',
  scale_asg: '/aws/asg/scale',
  cordon_eks_node: '/aws/eks/cordon_node',
  drain_eks_node: '/aws/eks/drain_node',
  rotate_secret: '/aws/secretsmanager/rotate_secret',
  invoke_lambda: '/aws/lambda/invoke',
  redeploy_lambda: '/aws/lambda/redeploy',
  restart_ecs_service: '/aws/ecs/restart_service',
  // devops
  create_stack: '/aws/cloudformation/create_stack',
  update_stack: '/aws/cloudformation/update_stack',
  trigger_codepipeline: '/aws/codepipeline/trigger',
  ecr_push: '/aws/ecr/push',
  ecr_tag: '/aws/ecr/tag',
  update_lambda_function: '/aws/lambda/update_function',
  // data
  get_object: '/aws/s3/get_object',
  put_object: '/aws/s3/put_object',
  dynamodb_query: '/aws/dynamodb/query',
  dynamodb_scan: '/aws/dynamodb/scan',
  athena_query: '/aws/athena/query',
  redshift_query: '/aws/redshift/query',
  // destructive
  terminate_instance: '/aws/ec2/terminate_instance',
  delete_bucket: '/aws/s3/delete_bucket',
  delete_object: '/aws/s3/delete_object',
  delete_lambda: '/aws/lambda/delete',
  delete_stack: '/aws/cloudformation/delete_stack',
  delete_iam_user: '/aws/iam/delete_user',
  delete_iam_role: '/aws/iam/delete_role',
  // escape hatch
  raw_call: '/aws/raw_call',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const accountId = typeof params.account_id === 'string' ? params.account_id : undefined;
  const region = typeof params.region === 'string' ? params.region : undefined;
  const arn = typeof params.arn === 'string' ? params.arn : undefined;
  const service = typeof params.service === 'string' ? params.service : undefined;
  const resourceName = typeof params.name === 'string' ? params.name : undefined;

  const base: Record<string, unknown> = {};
  if (accountId) base.account_id = accountId;
  if (region) base.region = region;
  if (arn) base.arn = arn;
  if (service) base.service = service;
  if (resourceName) base.name = resourceName;

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
