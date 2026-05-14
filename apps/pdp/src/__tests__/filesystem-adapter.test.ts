import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  resolveAgainstConstraint,
  treeDirWithConstraint,
  writeFileWithConstraint,
} from '../adapters/filesystem.js';

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

  describe('write/create/delete/move/copy ops', () => {
    it('writes a new file inside the prefix', async () => {
      const target = path.join(root, 'finance', '2026', 'new.txt');
      const r = await writeFileWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: target,
        content: 'hello',
      });
      expect(r.ok).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('hello');
    });

    it('rejects write to a path whose parent escapes the prefix', async () => {
      const target = path.join(root, 'finance', '2025', 'sneaky.txt');
      const r = await writeFileWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: target,
        content: 'evil',
      });
      expect(r.ok).toBe(false);
    });

    it('createFile fails with EEXIST when target exists', async () => {
      const target = path.join(root, 'finance', '2026', 'q1.txt');
      const r = await createFileWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: target,
        content: 'overwrite',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('file_already_exists');
    });

    it('deleteFile inside prefix succeeds', async () => {
      const target = path.join(root, 'finance', '2026', 'q1.txt');
      const r = await deleteFileWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: target,
      });
      expect(r.ok).toBe(true);
    });

    it('move within prefix renames; move outside prefix rejected', async () => {
      const src = path.join(root, 'finance', '2026', 'q1.txt');
      const dstInside = path.join(root, 'finance', '2026', 'q1-renamed.txt');
      const r1 = await moveWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        sourcePath: src,
        destinationPath: dstInside,
      });
      expect(r1.ok).toBe(true);

      const dstOutside = path.join(root, 'finance', '2025', 'leaked.txt');
      const r2 = await moveWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        sourcePath: dstInside,
        destinationPath: dstOutside,
      });
      expect(r2.ok).toBe(false);
    });

    it('copy within prefix duplicates contents', async () => {
      const src = path.join(root, 'finance', '2026', 'q1.txt');
      const dst = path.join(root, 'finance', '2026', 'q1-copy.txt');
      const r = await copyWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        sourcePath: src,
        destinationPath: dst,
      });
      expect(r.ok).toBe(true);
      expect(await readFile(dst, 'utf-8')).toBe('q1-allowed');
    });

    it('listDir returns entries inside the prefix', async () => {
      const r = await listDirWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance') },
        requestedPath: path.join(root, 'finance', '2026'),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.entries.some((e) => e.name === 'q1.txt')).toBe(true);
    });

    it('treeDir limits depth to prevent runaway recursion', async () => {
      const r = await treeDirWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: root },
        requestedPath: root,
        depth: 2,
      });
      expect(r.ok).toBe(true);
    });

    it('createDir inside prefix creates the dir', async () => {
      const newDir = path.join(root, 'finance', '2026', 'subdir');
      const r = await createDirWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: newDir,
      });
      expect(r.ok).toBe(true);
    });

    it('deleteDir refuses non-empty dir', async () => {
      const r = await deleteDirWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance') },
        requestedPath: path.join(root, 'finance', '2026'),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('dir_not_empty');
    });

    it('deleteDirRecursive refuses to delete the prefix root itself', async () => {
      const r = await deleteDirRecursiveWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: path.join(root, 'finance', '2026') },
        requestedPath: path.join(root, 'finance', '2026'),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('path_outside_constraint');
    });

    it('deleteDirRecursive within prefix removes a subdir tree', async () => {
      const target = path.join(root, 'finance', '2026');
      await mkdir(path.join(target, 'subtree', 'deep'), { recursive: true });
      await writeFile(path.join(target, 'subtree', 'deep', 'file.txt'), 'x');
      const r = await deleteDirRecursiveWithConstraint({
        constraint: { provider: 'filesystem', path_prefix: target },
        requestedPath: path.join(target, 'subtree'),
      });
      expect(r.ok).toBe(true);
    });
  });
});
