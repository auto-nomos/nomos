/**
 * Google Drive hand-curated overrides. Generated floor enforces the
 * action-specific method+path; this layer adds the shared
 * `googleDriveResource` zod for Cedar matching plus a `share_file` body
 * shape (Drive requires `type` + `role`).
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

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

const googleDriveResource = z
  .object({
    file_id: z.string().optional(),
    folder_id: z.string().optional(),
    drive_id: z.string().optional(),
    permission_id: z.string().optional(),
  })
  .passthrough();

const sharePermissionCall = apiCallBase.extend({
  method: z.literal('POST'),
  body: z
    .object({
      type: z.enum(['user', 'group', 'domain', 'anyone']),
      role: z.enum(['reader', 'commenter', 'writer', 'owner']),
    })
    .passthrough()
    .optional(),
});

export const googleDriveActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/google/drive/read': { resourceSchema: googleDriveResource },
  '/google/drive/list': { resourceSchema: googleDriveResource },
  '/google/drive/write': { resourceSchema: googleDriveResource },
  '/google/drive/update': { resourceSchema: googleDriveResource },
  '/google/drive/delete': { resourceSchema: googleDriveResource },
  '/google/drive/copy': { resourceSchema: googleDriveResource },
  '/google/drive/folder/create': { resourceSchema: googleDriveResource },
  '/google/drive/download': { resourceSchema: googleDriveResource },
  '/google/drive/export': { resourceSchema: googleDriveResource },
  '/google/drive/share': {
    apiCallSchema: sharePermissionCall,
    resourceSchema: googleDriveResource,
  },
  '/google/drive/permission/list': { resourceSchema: googleDriveResource },
  '/google/drive/permission/delete': { resourceSchema: googleDriveResource },
  '/google/drive/revision/list': { resourceSchema: googleDriveResource },
};
