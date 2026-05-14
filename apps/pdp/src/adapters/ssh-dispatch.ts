/**
 * Dispatches a Cedar SSH command to the correct `ssh.ts` adapter function.
 * Called by the proxy route after Cedar allow.
 *
 * SSH private key is read from env var SSH_PRIVATE_KEY (PEM, raw or
 * Base64-encoded). SSH_PASSPHRASE is optional. The constraint must carry
 * `host`; the apiCall body/query carries runtime connection params.
 */
import type { SshConstraint } from '@auto-nomos/shared-types';
import {
  sshCopyFile,
  sshCreateDir,
  sshCreateFile,
  sshDeleteDir,
  sshDeleteDirRecursive,
  sshDeleteFile,
  sshExec,
  sshListDir,
  sshMoveFile,
  sshReadFile,
  sshTreeDir,
  sshWriteFile,
} from './ssh.js';

function parseConstraint(raw: unknown): SshConstraint | null {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).provider === 'ssh' &&
    typeof (raw as Record<string, unknown>).host === 'string'
  ) {
    return raw as SshConstraint;
  }
  return null;
}

function loadPrivateKey(): string {
  const raw = process.env.SSH_PRIVATE_KEY;
  if (!raw)
    throw new Error('SSH_PRIVATE_KEY env var is not set — configure it to use SSH commands');
  // Accept Base64-encoded or raw PEM
  if (raw.startsWith('-----BEGIN')) return raw;
  return Buffer.from(raw, 'base64').toString('utf-8');
}

function bodyStr(apiCall: { body?: unknown }, key: string): string | undefined {
  const b = apiCall.body as Record<string, unknown> | undefined;
  return typeof b?.[key] === 'string' ? (b[key] as string) : undefined;
}

function bodyNum(apiCall: { body?: unknown }, key: string, def: number): number {
  const b = apiCall.body as Record<string, unknown> | undefined;
  const v = b?.[key];
  return typeof v === 'number' ? v : def;
}

function queryStr(apiCall: { query?: Record<string, string> }, key: string): string | undefined {
  return apiCall.query?.[key];
}

function queryNum(apiCall: { query?: Record<string, string> }, key: string, def: number): number {
  const v = apiCall.query?.[key];
  return v !== undefined ? parseInt(v, 10) : def;
}

export async function executeSshCommand(
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
    throw new Error('ssh command requires an ssh resource_constraint with host in the UCAN');
  }

  const privateKey = loadPrivateKey();
  const passphrase = process.env.SSH_PASSPHRASE;

  const host = queryStr(apiCall, 'host') || bodyStr(apiCall, 'host') || constraint.host;
  const port =
    queryNum(apiCall, 'port', 0) || bodyNum(apiCall, 'port', 0) || (constraint.port ?? 22);
  const username =
    queryStr(apiCall, 'username') || bodyStr(apiCall, 'username') || constraint.username || 'root';

  const base = { constraint, host, port, username, privateKey, passphrase };
  const op = apiCall.path;

  switch (op) {
    case '/file/read': {
      const filePath = queryStr(apiCall, 'path') || bodyStr(apiCall, 'path');
      if (!filePath) throw new Error('path required for ssh file read');
      const encoding = (queryStr(apiCall, 'encoding') ?? 'utf-8') as 'utf-8' | 'base64';
      const r = await sshReadFile({ ...base, path: filePath });
      if (!r.ok) throw new Error(`ssh read failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { content: r.bytes.toString(encoding), host, path: filePath };
    }

    case '/file/write': {
      const filePath = bodyStr(apiCall, 'path');
      const content = bodyStr(apiCall, 'content');
      if (!filePath || content === undefined) throw new Error('body.path + body.content required');
      const encoding = (bodyStr(apiCall, 'encoding') ?? 'utf-8') as BufferEncoding;
      const buf = Buffer.from(content, encoding);
      const r = await sshWriteFile({ ...base, path: filePath, content: buf });
      if (!r.ok)
        throw new Error(`ssh write failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { host, path: filePath };
    }

    case '/file/create': {
      const filePath = bodyStr(apiCall, 'path');
      const content = bodyStr(apiCall, 'content') ?? '';
      if (!filePath) throw new Error('body.path required');
      const encoding = (bodyStr(apiCall, 'encoding') ?? 'utf-8') as BufferEncoding;
      const buf = Buffer.from(content, encoding);
      const r = await sshCreateFile({ ...base, path: filePath, content: buf });
      if (!r.ok)
        throw new Error(`ssh create failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { host, path: filePath };
    }

    case '/file/delete': {
      const filePath = bodyStr(apiCall, 'path');
      if (!filePath) throw new Error('body.path required');
      const r = await sshDeleteFile({ ...base, path: filePath });
      if (!r.ok)
        throw new Error(`ssh delete failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { deleted: filePath, host };
    }

    case '/file/move': {
      const src = bodyStr(apiCall, 'path');
      const dst = bodyStr(apiCall, 'destination');
      if (!src || !dst) throw new Error('body.path + body.destination required');
      const r = await sshMoveFile({ ...base, path: src, destination: dst });
      if (!r.ok) throw new Error(`ssh move failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { from: src, to: dst, host };
    }

    case '/file/copy': {
      const src = bodyStr(apiCall, 'path');
      const dst = bodyStr(apiCall, 'destination');
      if (!src || !dst) throw new Error('body.path + body.destination required');
      const r = await sshCopyFile({ ...base, path: src, destination: dst });
      if (!r.ok) throw new Error(`ssh copy failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { from: src, to: dst, host };
    }

    case '/dir/list': {
      const dirPath = queryStr(apiCall, 'path') || bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('path required');
      const r = await sshListDir({ ...base, path: dirPath });
      if (!r.ok) throw new Error(`ssh list failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { path: dirPath, host, entries: r.entries };
    }

    case '/dir/tree': {
      const dirPath = queryStr(apiCall, 'path') || bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('path required');
      const depthStr = queryStr(apiCall, 'depth');
      const depth = depthStr ? parseInt(depthStr, 10) : 5;
      const r = await sshTreeDir({ ...base, path: dirPath, depth });
      if (!r.ok) throw new Error(`ssh tree failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { path: dirPath, host, tree: r.tree };
    }

    case '/dir/create': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await sshCreateDir({ ...base, path: dirPath });
      if (!r.ok)
        throw new Error(`ssh mkdir failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { created: dirPath, host };
    }

    case '/dir/delete': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await sshDeleteDir({ ...base, path: dirPath });
      if (!r.ok)
        throw new Error(`ssh rmdir failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { deleted: dirPath, host };
    }

    case '/dir/delete_recursive': {
      const dirPath = bodyStr(apiCall, 'path');
      if (!dirPath) throw new Error('body.path required');
      const r = await sshDeleteDirRecursive({ ...base, path: dirPath });
      if (!r.ok)
        throw new Error(`ssh rm -rf failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { deleted: dirPath, host };
    }

    case '/exec': {
      const cmd = bodyStr(apiCall, 'command');
      if (!cmd) throw new Error('body.command required');
      const timeoutMs = bodyNum(apiCall, 'timeout_ms', 30000);
      const r = await sshExec({ ...base, command: cmd, timeoutMs });
      if (!r.ok) throw new Error(`ssh exec failed: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
      return { stdout: r.stdout, stderr: r.stderr, code: r.code, host };
    }

    default:
      throw new Error(`unknown ssh operation: ${op}`);
  }
}
