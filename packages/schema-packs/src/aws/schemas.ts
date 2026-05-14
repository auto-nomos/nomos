import { z } from 'zod';
import type { IntegrationPack } from '../types.js';

// AWS API surface is heterogeneous — REST + RPC + query-string actions.
// We validate the wire shape liberally: method match + presence of an
// `Action` query param (RPC services) or non-empty path (REST).

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().min(1),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const read = apiCallBase.extend({ method: z.enum(['GET', 'POST']) });
const write = apiCallBase.extend({ method: z.enum(['POST', 'PATCH', 'PUT']) });
const deleteCall = apiCallBase.extend({ method: z.enum(['DELETE', 'POST']) });

const awsResource = z
  .object({
    account_id: z.string().optional(),
    region: z.string().optional(),
    arn: z.string().optional(),
    service: z.string().optional(),
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
    cmds.map((cmd) => [cmd, { apiCallSchema: read, resourceSchema: awsResource }]),
  );
const w = (cmds: readonly string[]) =>
  Object.fromEntries(
    cmds.map((cmd) => [cmd, { apiCallSchema: write, resourceSchema: awsResource }]),
  );
const d = (cmds: readonly string[]) =>
  Object.fromEntries(
    cmds.map((cmd) => [cmd, { apiCallSchema: deleteCall, resourceSchema: awsResource }]),
  );

export const awsActionSchemas: NonNullable<IntegrationPack['actionSchemas']> = {
  ...r([
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
  ]),
  ...w([
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
    '/aws/cloudformation/create_stack',
    '/aws/cloudformation/update_stack',
    '/aws/codepipeline/trigger',
    '/aws/ecr/push',
    '/aws/ecr/tag',
    '/aws/lambda/update_function',
    '/aws/s3/put_object',
    '/aws/dynamodb/query',
    '/aws/dynamodb/scan',
    '/aws/athena/query',
    '/aws/redshift/query',
  ]),
  '/aws/s3/get_object': { apiCallSchema: read, resourceSchema: awsResource },
  ...d([
    '/aws/ec2/terminate_instance',
    '/aws/s3/delete_bucket',
    '/aws/s3/delete_object',
    '/aws/lambda/delete',
    '/aws/cloudformation/delete_stack',
    '/aws/iam/delete_user',
    '/aws/iam/delete_role',
  ]),
  '/aws/raw_call': { apiCallSchema: apiCallBase, resourceSchema: rawCallResource },
};
