import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileWithConstraint, resolveAgainstConstraint } from '../adapters/filesystem.js';

describe('filesystem adapter', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cb-fs-'));
    await mkdir(path.join(root, 'finance', '2026'), { recursive: true });
    await mkdir(path.join(root, 'finance', '2025'), { recursive: true });
    await writeFile(path.join(root, 'finance', '2026', 'q1.txt'), 'q1-allowed');
    await writeFile(path.join(root, 'finance', '2025', 'secret.txt'), 'leak');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads files inside the constraint prefix', async () => {
    const res = await readFileWithConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
      requestedPath: path.join(root, 'finance', '2026', 'q1.txt'),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(new TextDecoder().decode(res.bytes)).toBe('q1-allowed');
    }
  });

  it('rejects `..` traversal that escapes the prefix', async () => {
    const res = await readFileWithConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
      requestedPath: path.join(root, 'finance', '2026', '..', '2025', 'secret.txt'),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('symlink_escape');
  });

  it('rejects symlink that points outside the prefix', async () => {
    const linkPath = path.join(root, 'finance', '2026', 'evil');
    await symlink(path.join(root, 'finance', '2025', 'secret.txt'), linkPath);
    const res = await readFileWithConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
      requestedPath: linkPath,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('symlink_escape');
  });

  it('does not match a sibling that shares a prefix string', async () => {
    await mkdir(path.join(root, 'finance2'));
    await writeFile(path.join(root, 'finance2', 'leak.txt'), 'sibling');
    const res = await resolveAgainstConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance') },
      requestedPath: path.join(root, 'finance2', 'leak.txt'),
    });
    expect(res.ok).toBe(false);
  });

  it('returns path_not_found for missing requested path inside prefix', async () => {
    const res = await readFileWithConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
      requestedPath: path.join(root, 'finance', 'no-such-file.txt'),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('path_not_found');
  });

  it('rejects when constraint host does not match local host', async () => {
    const res = await resolveAgainstConstraint({
      constraint: {
        provider: 'filesystem',
        path_prefix: path.join(root, 'finance', '2026'),
        host: 'remote-laptop',
      },
      requestedPath: path.join(root, 'finance', '2026', 'q1.txt'),
      host: 'this-laptop',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('host_mismatch');
  });
});
