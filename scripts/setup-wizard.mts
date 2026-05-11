#!/usr/bin/env tsx
import { randomBytes } from 'node:crypto';
/**
 * Idempotent setup wizard.
 *
 * Generates every signing key + secret the dev stack needs, writes them
 * into .env.local at repo root, and creates a .cb-setup-done sentinel.
 * Re-running is safe — existing keys are preserved.
 *
 * Invoked by docker compose --profile init (service: setup-wizard) or
 * directly via `pnpm dev:setup`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeypair } from '@credential-broker/crypto';
import { bytesToHex } from '@noble/hashes/utils';

const repoRoot = process.env.CB_REPO_ROOT ?? process.cwd();
const envPath = resolve(repoRoot, '.env.local');
const sentinelPath = resolve(repoRoot, '.cb-setup-done');

function readBody(): string {
  return existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
}

function hasKey(body: string, key: string): boolean {
  return new RegExp(`^${key}=.+$`, 'm').test(body);
}

function append(body: string, key: string, value: string): string {
  if (body.length > 0 && !body.endsWith('\n')) body += '\n';
  return body + `${key}=${value}\n`;
}

let body = readBody();
const wrote: string[] = [];

function set(key: string, mk: () => string): void {
  if (hasKey(body, key)) return;
  body = append(body, key, mk());
  wrote.push(key);
}

if (!hasKey(body, 'CONTROL_PLANE_BUNDLE_SIGN_KEY')) {
  const kp = generateKeypair();
  body = append(body, 'CONTROL_PLANE_BUNDLE_SIGN_KEY', bytesToHex(kp.privateKey));
  body = append(body, 'CONTROL_PLANE_BUNDLE_VERIFY_KEY', bytesToHex(kp.publicKey));
  body = append(body, 'CONTROL_PLANE_BUNDLE_SIGN_DID', kp.did);
  wrote.push('CONTROL_PLANE_BUNDLE_*');
}

if (!hasKey(body, 'AUDIT_SIGN_KEY')) {
  const kp = generateKeypair();
  body = append(body, 'AUDIT_SIGN_KEY', bytesToHex(kp.privateKey));
  body = append(body, 'AUDIT_VERIFY_KEY', bytesToHex(kp.publicKey));
  body = append(body, 'AUDIT_SIGNING_KEY_ID', kp.did);
  wrote.push('AUDIT_SIGN_*');
}

set('OAUTH_TOKEN_ENCRYPTION_KEY', () => randomBytes(32).toString('hex'));
set('OAUTH_STATE_SIGN_SECRET', () => randomBytes(24).toString('base64url'));
set('BETTER_AUTH_SECRET', () => randomBytes(24).toString('base64url'));
set('CONTROL_PLANE_SERVICE_TOKEN', () => 'dev-' + randomBytes(16).toString('hex'));

const defaults: Record<string, string> = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgres://cb:cb@postgres:5432/cb_dev',
  DATABASE_DIRECT_URL: 'postgres://cb:cb@postgres:5432/cb_dev',
  REDIS_URL: 'redis://redis:6379',
  CONTROL_PLANE_URL: 'http://control-plane:8788',
  CONTROL_PLANE_PUBLIC_URL: 'http://localhost:8788',
  PDP_URL: 'http://pdp:8787',
  DASHBOARD_PUBLIC_URL: 'http://localhost:3000',
  NEXT_PUBLIC_CONTROL_PLANE_URL: 'http://localhost:8788',
  NEXT_PUBLIC_PDP_URL: 'http://localhost:8787',
  AUDIT_BACKEND: 'postgres',
  POLICY_REFRESH_MS: '60000',
  REVOCATION_REFRESH_MS: '5000',
  PDP_WEBHOOK_URLS: 'http://pdp:8787/v1/internal/refresh-revocations',
  STEPUP_DEFAULT_TTL_MS: '60000',
  KNOCK_WORKFLOW_ID: 'step-up-request',
  INTENT_COHERENCE_ENABLED: 'false',
  INTENT_CHAIN_CONTEXT_ENABLED: 'false',
  EGRESS_PROXY_ENABLED: 'false',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_BOT_USERNAME: '',
};
for (const [k, v] of Object.entries(defaults)) {
  if (!hasKey(body, k)) {
    body = append(body, k, v);
    wrote.push(k);
  }
}

writeFileSync(envPath, body, { mode: 0o600 });

console.info('credential-broker setup-wizard');
console.info(`  envPath:   ${envPath}`);
if (wrote.length === 0) {
  console.info('  no changes — all keys already present');
} else {
  console.info(`  wrote ${wrote.length} keys: ${wrote.join(', ')}`);
}

writeFileSync(sentinelPath, `${new Date().toISOString()}\n`);
console.info(`  sentinel:  ${sentinelPath}`);
console.info('');
console.info('Next: pnpm dev:up');
