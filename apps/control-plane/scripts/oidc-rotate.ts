#!/usr/bin/env tsx
/**
 * OIDC issuer key rotation CLI.
 *
 *   pnpm oidc-rotate publish <kid> <public-jwk-json> <kms-key-ref>
 *       Inserts a new row with status=next. Verifiers warm caches before
 *       cutover.
 *
 *   pnpm oidc-rotate promote <kid>
 *       next → active. The previously active row flips to retired.
 *
 *   pnpm oidc-rotate retire <kid>
 *       retired → removed (after the overlap window).
 *
 *   pnpm oidc-rotate generate-dev
 *       Generates a fresh RSA 2048 keypair, prints PKCS#8 PEM + matching
 *       JWK + suggested kid. For local dev — never used in prod.
 *
 *   pnpm oidc-rotate list
 *       Shows the current oidc_issuer_keys rows + status.
 *
 * Rotation cadence: 90 days. Overlap window: publish `next` 14d before
 * cutover, retire old 14d after.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { publicJwkFromPrivatePem, type RsaPublicJwk } from '@auto-nomos/crypto';
import { and, eq } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

type Command = 'publish' | 'promote' | 'retire' | 'generate-dev' | 'list';

async function main() {
  const [cmd, ...args] = process.argv.slice(2) as [Command | undefined, ...string[]];
  if (!cmd) {
    printUsage();
    process.exit(1);
  }

  if (cmd === 'generate-dev') {
    return generateDev();
  }

  const config = loadConfig();
  const db = createDb({ DATABASE_URL: config.DATABASE_URL });

  try {
    switch (cmd) {
      case 'publish':
        return await publish(db, args);
      case 'promote':
        return await promote(db, args);
      case 'retire':
        return await retire(db, args);
      case 'list':
        return await list(db);
      default:
        printUsage();
        process.exit(1);
    }
  } finally {
    await db.pool.end();
  }
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  oidc-rotate publish <kid> <public-jwk-json> <kms-key-ref>',
      '  oidc-rotate promote <kid>',
      '  oidc-rotate retire <kid>',
      '  oidc-rotate generate-dev',
      '  oidc-rotate list',
      '',
    ].join('\n'),
  );
}

async function publish(db: ReturnType<typeof createDb>, args: string[]): Promise<void> {
  const [kid, jwkJson, kmsKeyRef] = args;
  if (!kid || !jwkJson || !kmsKeyRef) {
    process.stderr.write('publish: <kid> <public-jwk-json> <kms-key-ref> required\n');
    process.exit(2);
  }
  const publicJwk = JSON.parse(jwkJson) as RsaPublicJwk;
  if (publicJwk.kid !== kid) {
    process.stderr.write(`JWK.kid (${publicJwk.kid}) does not match supplied kid (${kid})\n`);
    process.exit(2);
  }
  await db.drizzle.insert(schema.oidcIssuerKeys).values({
    kid,
    alg: 'RS256',
    publicJwk,
    kmsKeyRef,
    status: 'next',
  });
  process.stdout.write(`published kid=${kid} status=next\n`);
}

async function promote(db: ReturnType<typeof createDb>, args: string[]): Promise<void> {
  const [kid] = args;
  if (!kid) {
    process.stderr.write('promote: <kid> required\n');
    process.exit(2);
  }
  await db.drizzle.transaction(async (tx) => {
    // Demote current active → retired.
    await tx
      .update(schema.oidcIssuerKeys)
      .set({ status: 'retired', retiredAt: new Date() })
      .where(eq(schema.oidcIssuerKeys.status, 'active'));
    // Promote next → active.
    const [updated] = await tx
      .update(schema.oidcIssuerKeys)
      .set({ status: 'active', rotatedAt: new Date() })
      .where(and(eq(schema.oidcIssuerKeys.kid, kid), eq(schema.oidcIssuerKeys.status, 'next')))
      .returning();
    if (!updated) {
      throw new Error(`no row with kid=${kid} status=next`);
    }
  });
  process.stdout.write(`promoted kid=${kid} → active\n`);
}

async function retire(db: ReturnType<typeof createDb>, args: string[]): Promise<void> {
  const [kid] = args;
  if (!kid) {
    process.stderr.write('retire: <kid> required\n');
    process.exit(2);
  }
  const deleted = await db.drizzle
    .delete(schema.oidcIssuerKeys)
    .where(and(eq(schema.oidcIssuerKeys.kid, kid), eq(schema.oidcIssuerKeys.status, 'retired')))
    .returning();
  if (deleted.length === 0) {
    process.stderr.write(`no row with kid=${kid} status=retired\n`);
    process.exit(2);
  }
  process.stdout.write(`retired kid=${kid} removed\n`);
}

async function list(db: ReturnType<typeof createDb>): Promise<void> {
  const rows = await db.drizzle.select().from(schema.oidcIssuerKeys);
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
}

function generateDev(): void {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const kid = `dev-${randomBytes(4).toString('hex')}`;
  const jwk = publicJwkFromPrivatePem({ kid, privateKeyPem: pem });
  process.stdout.write(
    [
      '# Add these to .env.local (dev only):',
      `OIDC_DEV_KID=${kid}`,
      'OIDC_DEV_RSA_PRIVATE_KEY_PEM="' + pem.replace(/\n/g, '\\n') + '"',
      `OIDC_DEV_RSA_PUBLIC_JWK='${JSON.stringify(jwk)}'`,
      '',
    ].join('\n'),
  );
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
