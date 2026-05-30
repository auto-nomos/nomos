#!/usr/bin/env tsx
/**
 * Generate an RS256 keypair for the Nomos OIDC issuer (cloud-IAM M0).
 *
 * Emits three env values, ready to paste into the control-plane .env.local:
 *
 *   OIDC_DEV_KID
 *   OIDC_DEV_RSA_PRIVATE_KEY_PEM         (multi-line PEM; preserve newlines)
 *   OIDC_DEV_RSA_PUBLIC_JWK              (single-line JSON)
 *
 * The private key NEVER leaves the host running this script. The public
 * JWK ends up served at GET https://<OIDC_ISSUER_URL>/jwks.json so AWS
 * STS / Azure AD / GCP STS can verify ID tokens we mint.
 *
 * Usage:
 *   pnpm gen:oidc-keys                      # writes a .env block to stdout
 *   pnpm gen:oidc-keys --kid my-issuer-1    # override the kid (default: nomos-issuer-<yyyy-mm-dd>-1)
 *
 * AWS KMS path (prod): set OIDC_KMS_KEY_ARN instead. KMS_DEV_RSA_PUBLIC_JWK
 * is still required so JWKS can publish the matching public key — derive
 * it with `aws kms get-public-key`. Dev path = this script.
 */
import { createPublicKey, generateKeyPairSync } from 'node:crypto';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): { kid: string } {
  let kid = `nomos-issuer-${isoToday()}-1`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kid' && i + 1 < argv.length) {
      kid = String(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm gen:oidc-keys [--kid <key-id>]\n\n' +
          'Generates RS256 keypair for OIDC issuer. Prints env block to stdout.\n' +
          'Pipe to a file or copy/paste into the VM .env.local; never commit the PEM.',
      );
      process.exit(0);
    }
  }
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(kid)) {
    throw new Error(
      `Invalid --kid "${kid}". Allowed: [A-Za-z0-9_.:-], max 64 chars (this is the JWT kid header).`,
    );
  }
  return { kid };
}

function generate(kid: string): {
  pem: string;
  jwk: { kid: string; kty: 'RSA'; n: string; e: string; alg: 'RS256'; use: 'sig' };
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  void publicKey;

  // node's `KeyObject.export({ format: 'jwk' })` gives us n, e in base64url.
  const jwkRaw = createPublicKey(privateKey).export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  if (jwkRaw.kty !== 'RSA' || !jwkRaw.n || !jwkRaw.e) {
    throw new Error(
      'node failed to emit RSA JWK; this should not happen on supported node versions',
    );
  }

  return {
    pem: privateKey,
    jwk: { kid, kty: 'RSA', n: jwkRaw.n, e: jwkRaw.e, alg: 'RS256', use: 'sig' },
  };
}

function emitEnvBlock(kid: string, pem: string, jwk: object): string {
  // The PEM is multi-line. systemd EnvironmentFile + dotenv both support
  // single-quoted multi-line values, so we quote with single quotes. Make
  // sure the PEM ends with a single newline.
  const pemNormalised = pem.endsWith('\n') ? pem : `${pem}\n`;
  return [
    '',
    `# OIDC issuer signer (cloud-IAM M0) — generated ${new Date().toISOString()}`,
    `# kid: ${kid}`,
    '# Source of truth: scripts/gen-oidc-issuer-keys.mts',
    '# Rotation: regenerate, set status=next on the new kid, retire old after 28d overlap.',
    '',
    'OIDC_ISSUER_URL=https://id.auto-nomos.com',
    'OIDC_ID_TOKEN_TTL_SECONDS=300',
    `OIDC_DEV_KID=${kid}`,
    `OIDC_DEV_RSA_PRIVATE_KEY_PEM='${pemNormalised}'`,
    `OIDC_DEV_RSA_PUBLIC_JWK='${JSON.stringify(jwk)}'`,
    '',
  ].join('\n');
}

function main() {
  const { kid } = parseArgs(process.argv.slice(2));
  const { pem, jwk } = generate(kid);
  process.stdout.write(emitEnvBlock(kid, pem, jwk));
  process.stderr.write(
    [
      '',
      `# Generated OIDC issuer keypair`,
      `#   kid: ${kid}`,
      `#   alg: RS256`,
      `#   jwks public-n length: ${jwk.n.length} chars (b64url, ~256 bytes)`,
      '',
      '# Paste the block above into /opt/nomos/app/.env.local on the Azure VM',
      '# (chmod 600), then restart nomos-control-plane:',
      '#',
      '#   sudo systemctl restart nomos-control-plane',
      '#',
      '# Verify:',
      '#   curl -fsS https://id.auto-nomos.com/.well-known/openid-configuration | jq',
      '#   curl -fsS https://id.auto-nomos.com/jwks.json | jq',
      '',
    ].join('\n'),
  );
}

main();
