/**
 * Filesystem proxy adapter — data-plane enforcement layer for the
 * dynamic-scope slice. The PDP-side equivalent of the OAuth adapter:
 * given an allow decision and a UCAN carrying a filesystem
 * `resource_constraint`, this module reads bytes from disk only when
 * the requested path stays inside the constraint's `path_prefix`.
 *
 * Two attacks the gate must defeat:
 *
 *   1. `..` traversal — the agent claims `path_prefix=/safe/` but
 *      requests `/safe/../etc/passwd`. `path.resolve` collapses to an
 *      absolute path; the prefix check then fails.
 *
 *   2. Symlink escape — `/safe/link` points at `/etc/passwd`. We call
 *      `fs.realpath` and compare the *real* path against the *real*
 *      prefix. Both ends are realpath'd so a symlinked prefix still
 *      enforces consistently.
 *
 * The constraint check is layered on top of the PDP's authorize gate
 * (which validates the UCAN→request.resource match). This adapter is
 * the last line: even a buggy policy cannot leak bytes outside the
 * prefix because the read itself refuses.
 */
import { readFile, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { FilesystemConstraint } from '@auto-nomos/shared-types';

export type FilesystemAdapterFailure =
  | 'path_outside_constraint'
  | 'path_not_found'
  | 'symlink_escape'
  | 'host_mismatch';

export type FilesystemReadResult =
  | { ok: true; bytes: Uint8Array; realPath: string }
  | { ok: false; reason: FilesystemAdapterFailure };

export interface FilesystemReadInput {
  constraint: FilesystemConstraint;
  /** The path the agent claims it wants to read. */
  requestedPath: string;
  /** Local host identifier. When the constraint pins a host, must match. */
  host?: string;
}

/**
 * Resolve and validate a path against a constraint without reading the
 * file. Useful for listing operations and as a unit-testable seam
 * separate from disk I/O.
 */
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
    // Constraint root must exist; if the issuer signed a constraint that
    // points at a non-existent prefix we reject — likely a misconfig.
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

  // Append separator so `/safe` does not match `/safe2` by accident.
  const prefixWithSep = realPrefix.endsWith(path.sep) ? realPrefix : realPrefix + path.sep;
  if (realRequested !== realPrefix && !realRequested.startsWith(prefixWithSep)) {
    return { ok: false, reason: 'symlink_escape' };
  }
  return { ok: true, bytes: new Uint8Array(), realPath: realRequested };
}

export async function readFileWithConstraint(
  input: FilesystemReadInput,
): Promise<FilesystemReadResult> {
  const resolved = await resolveAgainstConstraint(input);
  if (!resolved.ok) return resolved;
  const bytes = await readFile(resolved.realPath);
  return { ok: true, bytes: new Uint8Array(bytes), realPath: resolved.realPath };
}
