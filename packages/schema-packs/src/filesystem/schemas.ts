import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const safeFsPath = z
  .string()
  .min(1)
  .refine((p) => !p.includes('..'), { message: 'path must not contain ".." segments' });

const fsResource = z
  .object({
    path: safeFsPath.optional(),
    extension: z.string().optional(),
    type: z.enum(['file', 'directory']).optional(),
    destination: safeFsPath.optional(),
  })
  .passthrough();

const readCall = z.object({
  method: z.literal('GET'),
  path: z.literal('/file/read'),
  query: z.object({ path: safeFsPath }).catchall(z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const writeCall = z.object({
  method: z.literal('POST'),
  path: z.literal('/file/write'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath, content: z.string() }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const createFileCall = z.object({
  method: z.literal('POST'),
  path: z.literal('/file/create'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const deleteFileCall = z.object({
  method: z.literal('DELETE'),
  path: z.literal('/file/delete'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const moveFileCall = z.object({
  method: z.literal('POST'),
  path: z.literal('/file/move'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath, destination: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const copyFileCall = z.object({
  method: z.literal('POST'),
  path: z.literal('/file/copy'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath, destination: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const listDirCall = z.object({
  method: z.literal('GET'),
  path: z.literal('/dir/list'),
  query: z.object({ path: safeFsPath }).catchall(z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const treeDirCall = z.object({
  method: z.literal('GET'),
  path: z.literal('/dir/tree'),
  query: z.object({ path: safeFsPath }).catchall(z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const createDirCall = z.object({
  method: z.literal('POST'),
  path: z.literal('/dir/create'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const deleteDirCall = z.object({
  method: z.literal('DELETE'),
  path: z.literal('/dir/delete'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const deleteDirRecursiveCall = z.object({
  method: z.literal('DELETE'),
  path: z.literal('/dir/delete_recursive'),
  query: z.record(z.string(), z.string()).optional(),
  body: z.object({ path: safeFsPath }).passthrough().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const filesystemActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/filesystem/file/read': { apiCallSchema: readCall, resourceSchema: fsResource },
  '/filesystem/file/write': { apiCallSchema: writeCall, resourceSchema: fsResource },
  '/filesystem/file/create': { apiCallSchema: createFileCall, resourceSchema: fsResource },
  '/filesystem/file/delete': { apiCallSchema: deleteFileCall, resourceSchema: fsResource },
  '/filesystem/file/move': { apiCallSchema: moveFileCall, resourceSchema: fsResource },
  '/filesystem/file/copy': { apiCallSchema: copyFileCall, resourceSchema: fsResource },
  '/filesystem/dir/list': { apiCallSchema: listDirCall, resourceSchema: fsResource },
  '/filesystem/dir/tree': { apiCallSchema: treeDirCall, resourceSchema: fsResource },
  '/filesystem/dir/create': { apiCallSchema: createDirCall, resourceSchema: fsResource },
  '/filesystem/dir/delete': { apiCallSchema: deleteDirCall, resourceSchema: fsResource },
  '/filesystem/dir/delete_recursive': {
    apiCallSchema: deleteDirRecursiveCall,
    resourceSchema: fsResource,
  },
};
