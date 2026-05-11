import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Host-side wrapper. Locates the repo root by walking up looking for
 * pnpm-workspace.yaml, then invokes `pnpm tsx scripts/setup-wizard.mts`
 * which is the single source of truth for secret generation.
 *
 * This way `cb setup` and `pnpm dev:setup` always do exactly the same thing.
 */
export async function runSetup(args: string[]): Promise<void> {
  const repoRoot = process.env.CB_REPO_ROOT ?? findRepoRoot(process.cwd());
  if (!repoRoot) {
    process.stderr.write(
      'cb setup: could not find repo root (no pnpm-workspace.yaml in any ancestor).\n',
    );
    process.exit(2);
  }

  await new Promise<void>((res, rej) => {
    const child = spawn('pnpm', ['tsx', 'scripts/setup-wizard.mts', ...args], {
      cwd: repoRoot,
      env: { ...process.env, CB_REPO_ROOT: repoRoot },
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`exit ${code}`))));
    child.on('error', rej);
  });
}

function findRepoRoot(start: string): string | null {
  let cur = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = resolve(cur, '..');
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}
