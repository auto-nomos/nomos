/* eslint-disable no-console */
import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import { serve } from '@hono/node-server';
import autocannon from 'autocannon';
import pino from 'pino';
import { createPolicyCache } from '../src/cache/policies.js';
import { createRevocationCache } from '../src/cache/revocations.js';
import { createServer } from '../src/server.js';

const CUSTOMER = '550e8400-e29b-41d4-a716-446655440000';
const PORT = Number(process.env.BENCH_PORT ?? 8788);
const DURATION = Number(process.env.BENCH_DURATION ?? 10);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 50);

const policy = `
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
)
when {
  resource.repo == "acme/billing"
};
`;

function payload(iss: string, aud: string): UcanPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss,
    aud,
    cmd: '/github/issue/create',
    pol: [],
    nonce: 'bench',
    nbf: now - 60,
    exp: now + 3600,
  };
}

async function main(): Promise<void> {
  const logger = pino({ level: 'silent' });
  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  policyCache.set(CUSTOMER, policy);
  const revocationCache = createRevocationCache({
    fetchRevocations: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });

  const app = createServer({ logger, policyCache, revocationCache });
  const server = serve({ fetch: app.fetch, port: PORT });

  const issuer = generateKeypair();
  const agent = generateKeypair();
  const ucan = issueUcan({
    payload: payload(issuer.did, agent.did),
    privateKey: issuer.privateKey,
  });

  const body = JSON.stringify({
    ucan: ucan.jwt,
    command: '/github/issue/create',
    resource: { repo: 'acme/billing' },
    context: {},
  });

  console.info(
    `Starting benchmark: ${CONNECTIONS} connections × ${DURATION}s against http://127.0.0.1:${PORT}/v1/authorize`,
  );

  const result = await autocannon({
    url: `http://127.0.0.1:${PORT}/v1/authorize`,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
    body,
    duration: DURATION,
    connections: CONNECTIONS,
  });

  console.info('---');
  console.info(`Requests:    ${result.requests.total}`);
  console.info(`Throughput:  ${result.requests.average.toFixed(1)} req/s`);
  console.info(`Latency p50:    ${result.latency.p50}ms`);
  console.info(`Latency p90:    ${result.latency.p90}ms`);
  console.info(`Latency p97.5:  ${result.latency.p97_5}ms`);
  console.info(`Latency p99:    ${result.latency.p99}ms`);
  console.info(`Latency max:    ${result.latency.max}ms`);
  console.info(`Errors:      ${result.errors}`);
  console.info(`Timeouts:    ${result.timeouts}`);

  server.close();
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
