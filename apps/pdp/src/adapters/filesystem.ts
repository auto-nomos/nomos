/**
 * Filesystem proxy adapter — data-plane enforcement layer for local filesystem
 * access. All operations validate the requested path against the UCAN-signed
 * `resource_constraint.path_prefix` before touching disk.
 *
 * Attacks defeated:
 *   1. `..` traversal — path.resolve collapses before prefix check.
 *   2. Symlink escape — fs.realpath is called on both ends; a symlink inside
 *      the prefix pointing outside it is caught.
 *   3. Host mismatch — when the constraint pins a host the caller-supplied
 *      hostname must match exactly.
 */
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import * as path from 'node:path';
import type { FilesystemConstraint } from '@auto-nomos/shared-types';

export type FilesystemAdapterFailure =
  | 'path_outside_constraint'
  | 'path_not_found'
  | 'symlink_escape'
  | 'host_mismatch'
  | 'target_outside_constraint'
  | 'file_already_exists'
  | 'dir_not_empty'
  | 'depth_limit_exceeded';

export type FilesystemResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; reason: FilesystemAdapterFailure };

export type FilesystemReadResult =
  | { ok: true; bytes: Uint8Array; realPath: string }
  | { ok: false; reason: FilesystemAdapterFailure };

export interface FilesystemReadInput {
  constraint: FilesystemConstraint;
  requestedPath: string;
  host?: string;
}

export interface FilesystemWriteInput {
  constraint: FilesystemConstraint;
  requestedPath: string;
  content: Buffer | Uint8Array | string;
  host?: string;
}

export interface FilesystemMoveInput {
  constraint: FilesystemConstraint;
  sourcePath: string;
  destinationPath: string;
  host?: string;
}

export interface FilesystemDirInput {
  constraint: FilesystemConstraint;
  requestedPath: string;
  host?: string;
}

export interface DirEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
}

export interface TreeEntry extends DirEntry {
  children?: TreeEntry[];
}

/** Resolve and check a path against the constraint (no disk I/O except realpath). */
export async function resolveAgainstConstraint(
  input: FilesystemReadInput,
): Promise<FilesystemReadResult> {
  if (input.constraint.host) {
    if (!input.host || input.host !== input.constraint.host) {
      return { ok: false, reason: 'host_mismatch' };
    }
  }
  const absRequested = path.resolve(input.requestedPath);
  const absPrefix = path.resolve(input.constraint.path_prefix);

  let realRequested: string;
  let realPrefix: string;
  try {
    realPrefix = await realpath(absPrefix);
  } catch {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  try {
    realRequested = await realpath(absRequested);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, reason: 'path_not_found' };
    }
    return { ok: false, reason: 'path_not_found' };
  }

  const prefixWithSep = realPrefix.endsWith(path.sep) ? realPrefix : realPrefix + path.sep;
  if (realRequested !== realPrefix && !realRequested.startsWith(prefixWithSep)) {
    return { ok: false, reason: 'symlink_escape' };
  }
  return { ok: true, bytes: new Uint8Array(), realPath: realRequested };
}

/**
 * Resolve a NOT-YET-EXISTING path against constraint (for write/create).
 * We can't call realpath on a non-existent path, so we resolve the parent
 * and validate that.
 */
async function resolveNewPath(
  requestedPath: string,
  constraint: FilesystemConstraint,
  host?: string,
): Promise<{ ok: true; resolved: string } | { ok: false; reason: FilesystemAdapterFailure }> {
  if (constraint.host) {
    if (!host || host !== constraint.host) return { ok: false, reason: 'host_mismatch' };
  }
  const abs = path.resolve(requestedPath);
  const absPrefix = path.resolve(constraint.path_prefix);

  let realPrefix: string;
  try {
    realPrefix = await realpath(absPrefix);
  } catch {
    return { ok: false, reason: 'path_outside_constraint' };
  }

  // Resolve parent (must exist). The final component may not exist yet.
  const parentDir = path.dirname(abs);
  let realParent: string;
  try {
    realParent = await realpath(parentDir);
  } catch {
    return { ok: false, reason: 'path_not_found' };
  }

  const prefixWithSep = realPrefix.endsWith(path.sep) ? realPrefix : realPrefix + path.sep;
  if (realParent !== realPrefix && !realParent.startsWith(prefixWithSep)) {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  return { ok: true, resolved: path.join(realParent, path.basename(abs)) };
}

export async function readFileWithConstraint(
  input: FilesystemReadInput,
): Promise<FilesystemReadResult> {
  const resolved = await resolveAgainstConstraint(input);
  if (!resolved.ok) return resolved;
  const bytes = await readFile(resolved.realPath);
  return { ok: true, bytes: new Uint8Array(bytes), realPath: resolved.realPath };
}

export async function writeFileWithConstraint(
  input: FilesystemWriteInput,
): Promise<{ ok: true; realPath: string } | { ok: false; reason: FilesystemAdapterFailure }> {
  const r = await resolveNewPath(input.requestedPath, input.constraint, input.host);
  if (!r.ok) return r;
  await writeFile(r.resolved, input.content);
  return { ok: true, realPath: r.resolved };
}

export async function createFileWithConstraint(
  input: FilesystemWriteInput,
): Promise<{ ok: true; realPath: string } | { ok: false; reason: FilesystemAdapterFailure }> {
  const r = await resolveNewPath(input.requestedPath, input.constraint, input.host);
  if (!r.ok) return r;
  try {
    // O_EXCL: fail if file exists
    const fh = await open(r.resolved, 'wx');
    await fh.writeFile(input.content);
    await fh.close();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { ok: false, reason: 'file_already_exists' };
    }
    throw err;
  }
  return { ok: true, realPath: r.resolved };
}

export async function deleteFileWithConstraint(
  input: FilesystemReadInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const resolved = await resolveAgainstConstraint(input);
  if (!resolved.ok) return resolved;
  await unlink(resolved.realPath);
  return { ok: true };
}

export async function moveWithConstraint(
  input: FilesystemMoveInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const src = await resolveAgainstConstraint({
    constraint: input.constraint,
    requestedPath: input.sourcePath,
    host: input.host,
  });
  if (!src.ok) return src;

  const dst = await resolveNewPath(input.destinationPath, input.constraint, input.host);
  if (!dst.ok) return { ok: false, reason: 'target_outside_constraint' };

  await rename(src.realPath, dst.resolved);
  return { ok: true };
}

export async function copyWithConstraint(
  input: FilesystemMoveInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const src = await resolveAgainstConstraint({
    constraint: input.constraint,
    requestedPath: input.sourcePath,
    host: input.host,
  });
  if (!src.ok) return src;

  const dst = await resolveNewPath(input.destinationPath, input.constraint, input.host);
  if (!dst.ok) return { ok: false, reason: 'target_outside_constraint' };

  await copyFile(src.realPath, dst.resolved);
  return { ok: true };
}

export async function listDirWithConstraint(
  input: FilesystemDirInput,
): Promise<{ ok: true; entries: DirEntry[] } | { ok: false; reason: FilesystemAdapterFailure }> {
  const resolved = await resolveAgainstConstraint({
    ...input,
    requestedPath: input.requestedPath,
  });
  if (!resolved.ok) return resolved;

  const rawEntries = await readdir(resolved.realPath, { withFileTypes: true });
  const entries: DirEntry[] = rawEntries.map((e) => ({
    name: e.name,
    type: e.isDirectory()
      ? 'directory'
      : e.isSymbolicLink()
        ? 'symlink'
        : e.isFile()
          ? 'file'
          : 'other',
  }));
  return { ok: true, entries };
}

export async function treeDirWithConstraint(
  input: FilesystemDirInput & { depth?: number },
): Promise<{ ok: true; tree: TreeEntry[] } | { ok: false; reason: FilesystemAdapterFailure }> {
  const maxDepth = Math.min(input.depth ?? 5, 10);
  const resolved = await resolveAgainstConstraint({
    ...input,
    requestedPath: input.requestedPath,
  });
  if (!resolved.ok) return resolved;

  async function buildTree(dirPath: string, currentDepth: number): Promise<TreeEntry[]> {
    const rawEntries = await readdir(dirPath, { withFileTypes: true });
    const result: TreeEntry[] = [];
    for (const e of rawEntries) {
      const entry: TreeEntry = {
        name: e.name,
        type: e.isDirectory()
          ? 'directory'
          : e.isSymbolicLink()
            ? 'symlink'
            : e.isFile()
              ? 'file'
              : 'other',
      };
      if (e.isDirectory() && currentDepth < maxDepth) {
        entry.children = await buildTree(path.join(dirPath, e.name), currentDepth + 1);
      }
      result.push(entry);
    }
    return result;
  }

  const tree = await buildTree(resolved.realPath, 1);
  return { ok: true, tree };
}

export async function createDirWithConstraint(
  input: FilesystemDirInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const r = await resolveNewPath(input.requestedPath, input.constraint, input.host);
  if (!r.ok) return r;
  await mkdir(r.resolved, { recursive: true });
  return { ok: true };
}

export async function deleteDirWithConstraint(
  input: FilesystemDirInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const resolved = await resolveAgainstConstraint({
    ...input,
    requestedPath: input.requestedPath,
  });
  if (!resolved.ok) return resolved;

  try {
    await rmdir(resolved.realPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
      return { ok: false, reason: 'dir_not_empty' };
    }
    throw err;
  }
  return { ok: true };
}

export async function deleteDirRecursiveWithConstraint(
  input: FilesystemDirInput,
): Promise<{ ok: true } | { ok: false; reason: FilesystemAdapterFailure }> {
  const resolved = await resolveAgainstConstraint({
    ...input,
    requestedPath: input.requestedPath,
  });
  if (!resolved.ok) return resolved;

  // Guard: never delete the constraint root itself
  const realPrefix = await realpath(path.resolve(input.constraint.path_prefix)).catch(() => null);
  if (realPrefix && resolved.realPath === realPrefix) {
    return { ok: false, reason: 'path_outside_constraint' };
  }

  await rm(resolved.realPath, { recursive: true, force: false });
  return { ok: true };
}

/** Stat a path (constraint-checked). Used internally. */
export async function statWithConstraint(
  input: FilesystemReadInput,
): Promise<
  | { ok: true; isFile: boolean; isDirectory: boolean; size: number }
  | { ok: false; reason: FilesystemAdapterFailure }
> {
  const resolved = await resolveAgainstConstraint(input);
  if (!resolved.ok) return resolved;
  const s = await stat(resolved.realPath);
  return { ok: true, isFile: s.isFile(), isDirectory: s.isDirectory(), size: s.size };
}
