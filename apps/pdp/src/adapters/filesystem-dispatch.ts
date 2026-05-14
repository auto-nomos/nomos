/**
 * Dispatches a Cedar filesystem command to the correct `filesystem.ts`
 * adapter function. Called by the proxy route after Cedar allow.
 *
 * The `apiCall.path` is the virtual action path (/file/read, /dir/list, …).
 * The `constraint` is the UCAN-signed resource_constraint from UCAN meta.
 */
import * as os from 'node:os';
import type { FilesystemConstraint } from '@auto-nomos/shared-types';
import {
  copyWithConstraint,
  createDirWithConstraint,
  createFileWithConstraint,
  deleteDirRecursiveWithConstraint,
  deleteDirWithConstraint,
  deleteFileWithConstraint,
  listDirWithConstraint,
  moveWithConstraint,
  readFileWithConstraint,
  treeDirWithConstraint,
  writeFileWithConstraint,
} from './filesystem.js';

function parseConstraint(raw: unknown): FilesystemConstraint | null {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).provider === 'filesystem' &&
    typeof (raw as Record<string, unknown>).path_prefix === 'string'
  ) {
    return raw as FilesystemConstraint;
  }
  return null;
}

function bodyStr(apiCall: { body?: unknown }, key: string): string | undefined {
  const b = apiCall.body as Record<string, unknown> | undefined;
  return typeof b?.[key] === 'string' ? (b[key] as string) : undefined;
}

function queryStr(apiCall: { query?: Record<string, string> }, key: string): string | undefined {
  return apiCall.query?.[key];
}

export async function executeFilesystemCommand(
  command: string,
  apiCall: {
    method: string;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
  },
  rawConstraint: unknown,
): Promise<unknown> {
  const constraint = parseConstraint(rawConstraint);
  if (!constraint) {
    throw new Error('filesystem command requires a filesystem resource_constraint in the UCAN');
  }

  const host = os.hostname();
  const op = apiCall.path; // e.g. /file/read

  switch (op) {
    case '/file/read': {
      const filePath = queryStr(apiCall, 'path');
      if (!filePath) throw new Error('query.path required for /file/read');
      const encoding = (queryStr(apiCall, 'encoding') ?? 'utf-8') as 'utf-8' | 'base64';
      const r = await readFileWithConstraint({ constraint, requestedPath: filePath, host });
      if (!r.ok) throw new Error(`filesystem read failed: ${r.reason}`);
      return { content: Buffer.from(r.bytes).toString(encoding), realPath: r.realPath };
    }

    case '/file/write': {
      const filePath = bodyStr(apiCall, 'path');
      const content = bodyStr(apiCall, 'content');
      if (!filePath || content === undefined) throw new Error('body.path + body.content required');
      const encoding = (bodyStr(apiCall, 'encoding') ?? 'utf-8') as BufferEncoding;
      const buf = Buffer.from(content, encoding);
      const r = await writeFileWithConstraint({
        constraint,
        requestedPath: filePath,
        content: buf,
        host,
      });
      if (!r.ok) throw new Error(`filesystem write failed: ${r.reason}`);
      return { realPath: r.realPath };
    }

    case '/file/create': {
      const filePath = bodyStr(apiCall, 'path');
      const content = bodyStr(apiCall, 'content') ?? '';
      if (!filePath) throw new Error('body.path required');
      const encoding = (bodyStr(apiCall, 'encoding') ?? 'utf-8') as BufferEncoding;
      const buf = Buffer.from(content, encoding);
      const r = await createFileWithConstraint({
        constraint,
        requestedPath: filePath,
        content: buf,
        host,
      });
      if (!r.ok) throw new Error(`filesystem create failed: ${r.reason}`);
      return { realPath: r.realPath };
    }

    case '/file/delete': {
      const filePath = bodyStr(apiCall, 'path');
      if (!filePath) throw new Error('body.path required');
      const r = await deleteFileWithConstraint({ constraint, requestedPath: filePath, host });
      if (!r.ok) throw new Error(`filesystem delete failed: ${r.reason}`);
      return { deleted: filePath };
    }

    case '/file/move': {
      const src = bodyStr(apiCall, 'path');
      const dst = bodyStr(apiCall, 'destination');
      if (!src || !dst) throw new Error('body.path + body.destination required');
      const r = await moveWithConstraint({
        constraint,
        sourcePath: src,
        destinationPath: dst,
        host,
      });
      if (!r.ok) throw new Error(`filesystem move failed: ${r.reason}`);
      return { from: src, to: dst };
    }

    case '/file/copy': {
      const src = bodyStr(apiCall, 'path');
      const dst = bodyStr(apiCall, 'destination');
      if (!src || !dst) throw new Error('body.path + body.destination required');
      const r = await copyWithConstraint({
        constraint,
        sourcePath: src,
        destinationPath: dst,
        host,
      });
      if (!r.ok) throw new Error(`filesystem copy failed: ${r.reason}`);
      return { from: src, to: dst };
    }

    case '/dir/list': {
      const dirPath = queryStr(apiCall, 'path');
      if (!dirPath) throw new Error('query.path required');
      const r = await listDirWithConstraint({ constraint, requestedPath: dirPath, host });
      if (!r.ok) throw new Error(`filesystem list failed: ${r.reason}`);
      return { path: dirPath, entries: r.entries };
    }

    case '/dir/tree': {
      const dirPath = queryStr(apiCall, 'path');
      if (!dirPath) throw new Error('query.path required');
      const depthStr = queryStr(apiCall, 'depth');
      const depth = depthStr ? parseInt(depthStr, 10) : 5;
      const r = await treeDirWithConstraint({ constraint, requestedPath: dirPath, host, depth });
      if (!r.ok) throw new Error(`filesystem tree failed: ${r.reason}`);
      return { path: dirPath, tree: r.tree };
    }

    case '/dir/create': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await createDirWithConstraint({ constraint, requestedPath: dirPath, host });
      if (!r.ok) throw new Error(`filesystem mkdir failed: ${r.reason}`);
      return { created: dirPath };
    }

    case '/dir/delete': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await deleteDirWithConstraint({ constraint, requestedPath: dirPath, host });
      if (!r.ok) throw new Error(`filesystem rmdir failed: ${r.reason}`);
      return { deleted: dirPath };
    }

    case '/dir/delete_recursive': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await deleteDirRecursiveWithConstraint({
        constraint,
        requestedPath: dirPath,
        host,
      });
      if (!r.ok) throw new Error(`filesystem rm -rf failed: ${r.reason}`);
      return { deleted: dirPath };
    }

    default:
      throw new Error(`unknown filesystem operation: ${op}`);
  }
}
