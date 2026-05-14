/**
 * SSH/SFTP adapter — data-plane enforcement for remote filesystem access.
 *
 * Uses `node-ssh` (wraps `ssh2`) to SFTP into remote hosts. The constraint
 * carries `host` (required), optional `username`, and optional `path_prefix`.
 * Path-prefix enforcement mirrors the local filesystem adapter: the resolved
 * remote path must start with the constraint prefix.
 *
 * SSH private key is loaded from env var `SSH_PRIVATE_KEY` (PEM, Base64 or
 * raw). For production deployments rotate keys via the SSH_PRIVATE_KEY env.
 *
 * Dependencies: `node-ssh` — run `pnpm add node-ssh` in apps/pdp if not
 * already present.
 */
import * as nodePath from 'node:path/posix';
import type { SshConstraint } from '@auto-nomos/shared-types';

/**
 * Minimal subset of `ssh2`'s SFTPWrapper used here. We don't depend on
 * `@types/ssh2` to keep the dev tree light — the relevant callbacks are
 * straightforward Node-style.
 */
interface SftpFileAttrs {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile(): boolean;
  size: number;
}
interface SftpEntry {
  filename: string;
  attrs: SftpFileAttrs;
}
type ErrCb = (err: Error | null) => void;
interface MinimalSftp {
  open(path: string, flags: string, cb: (err: Error | null, handle: unknown) => void): void;
  write(handle: unknown, buf: Buffer, off: number, len: number, pos: number, cb: ErrCb): void;
  close(handle: unknown, cb: ErrCb): void;
  unlink(path: string, cb: ErrCb): void;
  rename(src: string, dst: string, cb: ErrCb): void;
  readdir(path: string, cb: (err: Error | null, list: SftpEntry[]) => void): void;
  rmdir(path: string, cb: ErrCb): void;
  createReadStream(path: string): NodeJS.ReadableStream;
  createWriteStream(path: string): NodeJS.WritableStream;
}

export type SshAdapterFailure =
  | 'host_mismatch'
  | 'username_mismatch'
  | 'path_outside_constraint'
  | 'path_not_found'
  | 'file_already_exists'
  | 'dir_not_empty'
  | 'connect_failed'
  | 'exec_failed';

export type SshResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; reason: SshAdapterFailure; detail?: string };

export interface SshOpInput {
  constraint: SshConstraint;
  host: string;
  port?: number;
  username: string;
  privateKey: string;
  passphrase?: string;
}

export interface SshFileReadInput extends SshOpInput {
  path: string;
}

export interface SshFileWriteInput extends SshOpInput {
  path: string;
  content: Buffer | string;
}

export interface SshMoveInput extends SshOpInput {
  path: string;
  destination: string;
}

export interface SshExecInput extends SshOpInput {
  command: string;
  timeoutMs?: number;
}

export interface SshDirEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
}

export interface SshTreeEntry extends SshDirEntry {
  children?: SshTreeEntry[];
}

export function validateHost(
  input: SshOpInput,
): { ok: true } | { ok: false; reason: SshAdapterFailure } {
  if (input.host !== input.constraint.host) {
    return { ok: false, reason: 'host_mismatch' };
  }
  if (input.constraint.username && input.username !== input.constraint.username) {
    return { ok: false, reason: 'username_mismatch' };
  }
  return { ok: true };
}

export function validatePathPrefix(
  remotePath: string,
  constraint: SshConstraint,
): { ok: true } | { ok: false; reason: SshAdapterFailure } {
  if (!constraint.path_prefix) return { ok: true };
  // Reject paths containing shell-metacharacters that would survive into any
  // exec-based op (mkdir/rm). SFTP ops don't need this but consistent rejection
  // closes the boundary in one place.
  if (/[`$\\\n\r\0]/.test(remotePath) || remotePath.includes('$(') || remotePath.includes('${')) {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  const normPath = nodePath.resolve(remotePath);
  const normPrefix = nodePath.resolve(constraint.path_prefix);
  // Equal or strict child (with separator) — never `startsWith(prefix)` alone,
  // which lets `/foobar/secret` match prefix `/foo`.
  if (normPath !== normPrefix && !normPath.startsWith(`${normPrefix}/`)) {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  return { ok: true };
}

/**
 * Shell-quote a string using single quotes. Single-quoted strings in POSIX
 * shells suppress every form of expansion ($, backtick, glob). Embedded single
 * quotes are closed, escaped, and reopened: foo'bar → 'foo'\''bar'.
 */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Hard cap on connect attempt (ms). Stops a hung TCP from blocking the PDP. */
const SSH_CONNECT_TIMEOUT_MS = 10_000;

/** Per-op overall timeout (ms). Includes connect + SFTP/exec. */
const SSH_OP_TIMEOUT_MS = 30_000;

async function withSsh<T>(
  input: SshOpInput,
  fn: (ssh: import('node-ssh').NodeSSH) => Promise<T>,
  opTimeoutMs: number = SSH_OP_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; reason: SshAdapterFailure; detail: string }> {
  // Dynamic import so the module is optional — users who only need local
  // filesystem don't have to install node-ssh.
  let NodeSSHCtor: typeof import('node-ssh').NodeSSH;
  try {
    const mod = await import('node-ssh');
    NodeSSHCtor = mod.NodeSSH;
  } catch {
    throw new Error('node-ssh is not installed. Run: pnpm add node-ssh in apps/pdp');
  }

  const ssh = new NodeSSHCtor();
  const overallTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('ssh_op_timeout')), opTimeoutMs).unref();
  });
  try {
    await Promise.race([
      ssh.connect({
        host: input.host,
        port: input.port ?? input.constraint.port ?? 22,
        username: input.username,
        privateKey: input.privateKey,
        passphrase: input.passphrase,
        readyTimeout: SSH_CONNECT_TIMEOUT_MS,
      } as Parameters<import('node-ssh').NodeSSH['connect']>[0]),
      overallTimeout,
    ]);
    const value = await Promise.race([fn(ssh), overallTimeout]);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, reason: 'connect_failed', detail: (err as Error).message };
  } finally {
    ssh.dispose();
  }
}

export async function sshReadFile(
  input: SshFileReadInput,
): Promise<
  { ok: true; bytes: Buffer } | { ok: false; reason: SshAdapterFailure; detail?: string }
> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(input.path);
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });

  if (!result.ok) return result;
  return { ok: true, bytes: result.value };
}

export async function sshWriteFile(
  input: SshFileWriteInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const buf = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content as string);

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(input.path);
      stream.on('close', resolve);
      stream.on('error', reject);
      stream.end(buf);
    });
  });

  if (!result.ok) return result;
  return { ok: true };
}

export async function sshCreateFile(
  input: SshFileWriteInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const buf = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content as string);

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    // O_EXCL equivalent — fail if file exists
    return new Promise<void>((resolve, reject) => {
      sftp.open(input.path, 'wx', (err, handle) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
            reject(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));
          } else {
            reject(err);
          }
          return;
        }
        sftp.write(handle, buf, 0, buf.length, 0, (werr) => {
          sftp.close(handle, () => {
            if (werr) reject(werr);
            else resolve();
          });
        });
      });
    });
  });

  if (!result.ok) {
    if (result.detail?.includes('EEXIST')) return { ok: false, reason: 'file_already_exists' };
    return result;
  }
  return { ok: true };
}

export async function sshDeleteFile(
  input: SshFileReadInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<void>((resolve, reject) => {
      sftp.unlink(input.path, (err) => (err ? reject(err) : resolve()));
    });
  });

  if (!result.ok) return result;
  return { ok: true };
}

export async function sshMoveFile(
  input: SshMoveInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const spv = validatePathPrefix(input.path, input.constraint);
  if (!spv.ok) return spv;
  const dpv = validatePathPrefix(input.destination, input.constraint);
  if (!dpv.ok) return { ok: false, reason: 'path_outside_constraint' };

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<void>((resolve, reject) => {
      sftp.rename(input.path, input.destination, (err) => (err ? reject(err) : resolve()));
    });
  });

  if (!result.ok) return result;
  return { ok: true };
}

export async function sshCopyFile(
  input: SshMoveInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const spv = validatePathPrefix(input.path, input.constraint);
  if (!spv.ok) return spv;
  const dpv = validatePathPrefix(input.destination, input.constraint);
  if (!dpv.ok) return { ok: false, reason: 'path_outside_constraint' };

  // SFTP has no native copy — read + write
  const readResult = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(input.path);
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
  if (!readResult.ok) return readResult;

  const writeResult = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(input.destination);
      stream.on('close', resolve);
      stream.on('error', reject);
      stream.end(readResult.value);
    });
  });
  if (!writeResult.ok) return writeResult;
  return { ok: true };
}

export async function sshListDir(
  input: SshFileReadInput,
): Promise<
  { ok: true; entries: SshDirEntry[] } | { ok: false; reason: SshAdapterFailure; detail?: string }
> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<SshDirEntry[]>((resolve, reject) => {
      sftp.readdir(input.path, (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          list.map((e) => ({
            name: e.filename,
            type: e.attrs.isDirectory()
              ? ('directory' as const)
              : e.attrs.isSymbolicLink()
                ? ('symlink' as const)
                : e.attrs.isFile()
                  ? ('file' as const)
                  : ('other' as const),
            size: e.attrs.size,
          })),
        );
      });
    });
  });

  if (!result.ok) return result;
  return { ok: true, entries: result.value };
}

export async function sshTreeDir(
  input: SshFileReadInput & { depth?: number },
): Promise<
  { ok: true; tree: SshTreeEntry[] } | { ok: false; reason: SshAdapterFailure; detail?: string }
> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;
  const maxDepth = Math.min(input.depth ?? 5, 10);

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;

    async function buildTree(dirPath: string, depth: number): Promise<SshTreeEntry[]> {
      const list = await new Promise<SftpEntry[]>((resolve, reject) => {
        sftp.readdir(dirPath, (err, entries) => (err ? reject(err) : resolve(entries)));
      });
      const out: SshTreeEntry[] = [];
      for (const e of list) {
        const entry: SshTreeEntry = {
          name: e.filename,
          type: e.attrs.isDirectory()
            ? 'directory'
            : e.attrs.isSymbolicLink()
              ? 'symlink'
              : e.attrs.isFile()
                ? 'file'
                : 'other',
          size: e.attrs.size,
        };
        if (e.attrs.isDirectory() && depth < maxDepth) {
          entry.children = await buildTree(nodePath.join(dirPath, e.filename), depth + 1);
        }
        out.push(entry);
      }
      return out;
    }

    return buildTree(input.path, 1);
  });

  if (!result.ok) return result;
  return { ok: true, tree: result.value };
}

export async function sshCreateDir(
  input: SshFileReadInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const result = await withSsh(input, async (ssh) => {
    // mkdir -p via exec is simpler than recursive SFTP mkdir.
    // Single-quote the path so $ / ` / glob / spaces are all literal.
    const r = await ssh.execCommand(`mkdir -p ${shQuote(input.path)}`);
    if (r.code !== 0) throw new Error(r.stderr);
  });

  if (!result.ok) return result;
  return { ok: true };
}

export async function sshDeleteDir(
  input: SshFileReadInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;

  const result = await withSsh(input, async (ssh) => {
    const sftp = (await ssh.requestSFTP()) as unknown as MinimalSftp;
    return new Promise<void>((resolve, reject) => {
      sftp.rmdir(input.path, (err) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
            reject(Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' }));
          } else {
            reject(err);
          }
          return;
        }
        resolve();
      });
    });
  });

  if (!result.ok) {
    if (result.detail?.includes('ENOTEMPTY')) return { ok: false, reason: 'dir_not_empty' };
    return result;
  }
  return { ok: true };
}

export async function sshDeleteDirRecursive(
  input: SshFileReadInput,
): Promise<{ ok: true } | { ok: false; reason: SshAdapterFailure; detail?: string }> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;
  const pv = validatePathPrefix(input.path, input.constraint);
  if (!pv.ok) return pv;
  // Guard: never delete the constraint prefix root itself
  if (input.constraint.path_prefix) {
    const normPath = nodePath.resolve(input.path);
    const normPrefix = nodePath.resolve(input.constraint.path_prefix);
    if (normPath === normPrefix) return { ok: false, reason: 'path_outside_constraint' };
  }

  const result = await withSsh(input, async (ssh) => {
    // Single-quote: prevents $(...) / backtick / glob expansion.
    const r = await ssh.execCommand(`rm -rf ${shQuote(input.path)}`);
    if (r.code !== 0) throw new Error(r.stderr);
  });

  if (!result.ok) return result;
  return { ok: true };
}

/** Max stdout/stderr captured from /ssh/exec (1 MB each). */
const SSH_EXEC_OUTPUT_CAP_BYTES = 1024 * 1024;

export async function sshExec(
  input: SshExecInput,
): Promise<
  | { ok: true; stdout: string; stderr: string; code: number; truncated?: boolean }
  | { ok: false; reason: SshAdapterFailure; detail?: string }
> {
  const hv = validateHost(input);
  if (!hv.ok) return hv;

  const timeoutMs = Math.min(input.timeoutMs ?? 30_000, 120_000);
  const result = await withSsh(
    input,
    async (ssh) => {
      const r = await ssh.execCommand(input.command, {
        execOptions: { pty: false },
      });
      return r;
    },
    timeoutMs,
  );

  if (!result.ok) return result;
  const { stdout, stderr, code } = result.value;
  let truncated = false;
  let outStr = stdout;
  let errStr = stderr;
  if (Buffer.byteLength(stdout, 'utf-8') > SSH_EXEC_OUTPUT_CAP_BYTES) {
    outStr = Buffer.from(stdout, 'utf-8').slice(0, SSH_EXEC_OUTPUT_CAP_BYTES).toString('utf-8');
    truncated = true;
  }
  if (Buffer.byteLength(stderr, 'utf-8') > SSH_EXEC_OUTPUT_CAP_BYTES) {
    errStr = Buffer.from(stderr, 'utf-8').slice(0, SSH_EXEC_OUTPUT_CAP_BYTES).toString('utf-8');
    truncated = true;
  }
  return {
    ok: true,
    stdout: outStr,
    stderr: errStr,
    code: code ?? 0,
    ...(truncated ? { truncated } : {}),
  };
}
