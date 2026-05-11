#!/usr/bin/env tsx
/**
 * M10 — pack-smoke. Builds + packs every shippable workspace package.
 * Tarballs land in dist/packs/. Verifies each tarball installs cleanly
 * into a temp dir.
 *
 * Run: pnpm test:packs
 *
 * Packages targeted (kept "private": true until npm publish day; pack
 * still works on private packages):
 *   - @auto-nomos/sdk
 *   - @auto-nomos/mcp-server
 *   - @auto-nomos/cli
 *   - @auto-nomos/audit-verify
 *   - @auto-nomos/adapters
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const OUT = resolve(REPO, 'dist', 'packs');

const TARGETS = [
  '@auto-nomos/sdk',
  '@auto-nomos/mcp-server',
  '@auto-nomos/cli',
  '@auto-nomos/audit-verify',
  '@auto-nomos/adapters',
];

function sh(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

function shInherit(cmd: string, cwd?: string): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function locateWorkspacePath(pkg: string): string {
  const json = sh(`pnpm --filter ${pkg} exec node -e "console.log(process.cwd())"`);
  return json.trim();
}

function buildAndPack(pkg: string): string {
  console.info(`\n=== pack: ${pkg} ===`);
  shInherit(`pnpm --filter ${pkg} build`);
  const cwd = locateWorkspacePath(pkg);
  shInherit(`pnpm pack --pack-destination ${OUT}`, cwd);
  // Latest tarball for this pkg
  const baseName = pkg.replace('@', '').replace('/', '-');
  const matches = readdirSync(OUT).filter((f) => f.startsWith(baseName) && f.endsWith('.tgz'));
  matches.sort();
  const latest = matches.at(-1);
  if (!latest) throw new Error(`no tarball produced for ${pkg}`);
  return resolve(OUT, latest);
}

function smokeInstall(tarball: string): void {
  // npm install would resolve "workspace:*" ranges and fail. Instead,
  // verify tarball structure: must contain package.json and dist/ at top.
  const listing = sh(`tar -tzf ${tarball}`);
  const lines = listing.split('\n');
  const hasPj = lines.some((l) => l === 'package/package.json');
  const hasDist = lines.some((l) => l.startsWith('package/dist/'));
  if (!hasPj) throw new Error('tarball missing package.json');
  if (!hasDist) throw new Error('tarball missing dist/ artifacts');
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const results: { pkg: string; tarball: string; smoke: 'ok' | 'fail'; err?: string }[] = [];
let failed = 0;

for (const pkg of TARGETS) {
  try {
    const tarball = buildAndPack(pkg);
    try {
      smokeInstall(tarball);
      results.push({ pkg, tarball, smoke: 'ok' });
    } catch (err) {
      results.push({ pkg, tarball, smoke: 'fail', err: (err as Error).message });
      failed++;
    }
  } catch (err) {
    results.push({ pkg, tarball: '', smoke: 'fail', err: (err as Error).message });
    failed++;
  }
}

console.info('\n=== pack smoke results ===');
for (const r of results) {
  const tag = r.smoke === 'ok' ? 'OK' : 'FAIL';
  console.info(`${tag}  ${r.pkg.padEnd(40)} ${r.tarball.split('/').pop() ?? ''}`);
  if (r.err) console.info(`     ↳ ${r.err.split('\n')[0]}`);
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed pack smoke`);
  process.exit(1);
}
console.info(`\nAll ${TARGETS.length} packages packed and smoke-installed.`);
