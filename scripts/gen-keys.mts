#!/usr/bin/env tsx
/**
 * Generate the control plane bundle-signing keypair and write it to .env.local.
 *
 * Run once per environment (dev, staging, prod). The PDP needs the
 * corresponding public key in CONTROL_PLANE_BUNDLE_VERIFY_KEY to verify
 * signed policy bundles.
 *
 * Usage: pnpm gen-keys
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeypair } from '@credential-broker/crypto';
import { bytesToHex } from '@noble/hashes/utils';

const ENV_FILE = resolve(process.cwd(), '.env.local');

function appendOrUpdate(path: string, key: string, value: string): void {
  let body = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(body)) {
    body = body.replace(re, `${key}=${value}`);
  } else {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n';
    body += `${key}=${value}\n`;
  }
  writeFileSync(path, body, { mode: 0o600 });
}

const kp = generateKeypair();
const privateKeyHex = bytesToHex(kp.privateKey);
const publicKeyHex = bytesToHex(kp.publicKey);

appendOrUpdate(ENV_FILE, 'CONTROL_PLANE_BUNDLE_SIGN_KEY', privateKeyHex);
appendOrUpdate(ENV_FILE, 'CONTROL_PLANE_BUNDLE_VERIFY_KEY', publicKeyHex);
appendOrUpdate(ENV_FILE, 'CONTROL_PLANE_BUNDLE_SIGN_DID', kp.did);

console.info('Control-plane bundle signing keypair written to .env.local');
console.info(`  did:    ${kp.did}`);
console.info(`  pubkey: ${publicKeyHex}`);
console.info('');
console.info('PDP env needs CONTROL_PLANE_BUNDLE_VERIFY_KEY set to the same hex');
console.info('value above to verify signed bundle responses.');

// Sprint 8.3 / D-4 — separate keypair signs daily audit roots. The verify key
// ships to the audit-verify CLI (and gets pinned in customer compliance docs).
const auditKp = generateKeypair();
const auditPriv = bytesToHex(auditKp.privateKey);
const auditPub = bytesToHex(auditKp.publicKey);
appendOrUpdate(ENV_FILE, 'AUDIT_SIGN_KEY', auditPriv);
appendOrUpdate(ENV_FILE, 'AUDIT_VERIFY_KEY', auditPub);
appendOrUpdate(ENV_FILE, 'AUDIT_SIGNING_KEY_ID', auditKp.did);

console.info('');
console.info('Audit root signing keypair written to .env.local');
console.info(`  did:    ${auditKp.did}`);
console.info(`  pubkey: ${auditPub}`);
console.info('');
console.info('Audit verifier (npx @credential-broker/audit-verify) needs');
console.info('AUDIT_VERIFY_KEY set to the same hex value.');
