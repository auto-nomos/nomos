import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const safePath = z
  .string()
  .min(1)
  .refine((p) => !p.includes('..'), { message: 'path must not contain ".." segments' });

const sshResource = z
  .object({
    host: z.string().optional(),
    path: safePath.optional(),
    type: z.enum(['file', 'directory']).optional(),
    destination: safePath.optional(),
  })
  .passthrough();

function sshGetCall(opPath: string) {
  return z.object({
    method: z.literal('GET'),
    path: z.literal(opPath),
    query: z
      .object({ host: z.string().min(1), username: z.string().min(1), path: safePath })
      .catchall(z.string())
      .optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  });
}

function sshPostCall(opPath: string, extraBody: Record<string, z.ZodTypeAny> = {}) {
  return z.object({
    method: z.literal('POST'),
    path: z.literal(opPath),
    query: z.record(z.string(), z.string()).optional(),
    body: z
      .object({ host: z.string().min(1), username: z.string().min(1), ...extraBody })
      .passthrough()
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
  });
}

function sshDeleteCall(opPath: string) {
  return z.object({
    method: z.literal('DELETE'),
    path: z.literal(opPath),
    query: z.record(z.string(), z.string()).optional(),
    body: z
      .object({ host: z.string().min(1), username: z.string().min(1), path: safePath })
      .passthrough()
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
  });
}

export const sshActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/ssh/file/read': { apiCallSchema: sshGetCall('/file/read'), resourceSchema: sshResource },
  '/ssh/file/write': {
    apiCallSchema: sshPostCall('/file/write', { path: safePath, content: z.string() }),
    resourceSchema: sshResource,
  },
  '/ssh/file/create': {
    apiCallSchema: sshPostCall('/file/create', { path: safePath }),
    resourceSchema: sshResource,
  },
  '/ssh/file/delete': { apiCallSchema: sshDeleteCall('/file/delete'), resourceSchema: sshResource },
  '/ssh/file/move': {
    apiCallSchema: sshPostCall('/file/move', { path: safePath, destination: safePath }),
    resourceSchema: sshResource,
  },
  '/ssh/file/copy': {
    apiCallSchema: sshPostCall('/file/copy', { path: safePath, destination: safePath }),
    resourceSchema: sshResource,
  },
  '/ssh/dir/list': { apiCallSchema: sshGetCall('/dir/list'), resourceSchema: sshResource },
  '/ssh/dir/tree': { apiCallSchema: sshGetCall('/dir/tree'), resourceSchema: sshResource },
  '/ssh/dir/create': {
    apiCallSchema: sshPostCall('/dir/create', { path: safePath }),
    resourceSchema: sshResource,
  },
  '/ssh/dir/delete': { apiCallSchema: sshDeleteCall('/dir/delete'), resourceSchema: sshResource },
  '/ssh/dir/delete_recursive': {
    apiCallSchema: sshDeleteCall('/dir/delete_recursive'),
    resourceSchema: sshResource,
  },
  '/ssh/exec': {
    apiCallSchema: sshPostCall('/exec', { command: z.string().min(1) }),
    resourceSchema: sshResource,
  },
};
