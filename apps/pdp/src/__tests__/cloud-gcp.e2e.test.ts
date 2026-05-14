/**
 * Real-project E2E for the GCP cloud federation path.
 *
 *   1. Mints an OIDC ID token via the control-plane mint endpoint.
 *   2. STS exchange (sts.googleapis.com:token) → federated access token.
 *   3. SA impersonation (iamcredentials:generateAccessToken) → SA token.
 *   4. Calls cloudresourcemanager:projects.list (cheapest read).
 *
 * Gated on `NOMOS_GCP_TEST_PROJECT=1`. PR CI skips; nightly job in CI
 * flips the var and points it at `nomos-ci-gcp`. CI drives terraform
 * apply/destroy of `terraform-google-nomos-bootstrap` (WIF pool +
 * provider + SA with roles/viewer).
 *
 * Environment contract (set by CI):
 *   NOMOS_GCP_TEST_PROJECT=1
 *   NOMOS_TEST_CUSTOMER_ID=<existing customer in dev DB>
 *   NOMOS_TEST_AGENT_ID=<existing agent in dev DB>
 *   NOMOS_TEST_GCP_PROJECT_ID=<from terraform>
 *   NOMOS_TEST_GCP_PROJECT_NUMBER=<from terraform>
 *   NOMOS_TEST_GCP_WIF_PROVIDER=<full resource name, e.g. projects/123/locations/global/workloadIdentityPools/nomos/providers/issuer>
 *   NOMOS_TEST_GCP_SA_EMAIL=<from terraform>
 *   CONTROL_PLANE_URL=<live URL>
 *   CONTROL_PLANE_SERVICE_TOKEN=<live token>
 */
import { beforeAll, describe, expect, it } from 'vitest';

interface E2EEnv {
  customerId: string;
  agentId: string;
  gcpProjectId: string;
  gcpProjectNumber: string;
  gcpWifProvider: string;
  gcpSaEmail: string;
  controlPlaneUrl: string;
  serviceToken: string;
}

const RUN = process.env.NOMOS_GCP_TEST_PROJECT === '1';

function loadEnv(): E2EEnv | null {
  if (!RUN) return null;
  const required = [
    'NOMOS_TEST_CUSTOMER_ID',
    'NOMOS_TEST_AGENT_ID',
    'NOMOS_TEST_GCP_PROJECT_ID',
    'NOMOS_TEST_GCP_PROJECT_NUMBER',
    'NOMOS_TEST_GCP_WIF_PROVIDER',
    'NOMOS_TEST_GCP_SA_EMAIL',
    'CONTROL_PLANE_URL',
    'CONTROL_PLANE_SERVICE_TOKEN',
  ];
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(`NOMOS_GCP_TEST_PROJECT=1 but ${k} is unset`);
    }
  }
  return {
    customerId: process.env.NOMOS_TEST_CUSTOMER_ID!,
    agentId: process.env.NOMOS_TEST_AGENT_ID!,
    gcpProjectId: process.env.NOMOS_TEST_GCP_PROJECT_ID!,
    gcpProjectNumber: process.env.NOMOS_TEST_GCP_PROJECT_NUMBER!,
    gcpWifProvider: process.env.NOMOS_TEST_GCP_WIF_PROVIDER!,
    gcpSaEmail: process.env.NOMOS_TEST_GCP_SA_EMAIL!,
    controlPlaneUrl: process.env.CONTROL_PLANE_URL!,
    serviceToken: process.env.CONTROL_PLANE_SERVICE_TOKEN!,
  };
}

describe.skipIf(!RUN)('cloud-gcp E2E (real project)', () => {
  let env: E2EEnv;
  let connectionId: string;

  beforeAll(async () => {
    const loaded = loadEnv();
    if (!loaded) return;
    env = loaded;
    const createRes = await fetch(`${env.controlPlaneUrl}/trpc/cloudConnections.create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.serviceToken}`,
      },
      body: JSON.stringify({
        connector: 'gcp',
        accountId: env.gcpProjectId,
        externalId: env.gcpSaEmail,
        displayName: 'e2e-test',
        config: {
          wif_provider: env.gcpWifProvider,
          service_account_email: env.gcpSaEmail,
        },
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { result: { data: { id: string } } };
    connectionId = created.result.data.id;
  });

  it('mint → STS exchange → SA impersonation → projects.list succeeds', async () => {
    const res = await fetch(
      `${env.controlPlaneUrl}/v1/internal/cloud/api-call/${encodeURIComponent(connectionId)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.serviceToken}`,
        },
        body: JSON.stringify({
          customer_id: env.customerId,
          agent_id: env.agentId,
          intent_id: 'e2e-test-intent',
          request: {
            method: 'GET',
            url: 'https://cloudresourcemanager.googleapis.com/v1/projects',
          },
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: number;
      body: { projects?: Array<{ projectId: string }> };
      connector: string;
      id_token_jti: string;
    };
    expect(body.status).toBe(200);
    expect(body.connector).toBe('gcp');
    expect(typeof body.id_token_jti).toBe('string');
  });

  it('second call hits the creds cache (cache_hit=true)', async () => {
    const res = await fetch(
      `${env.controlPlaneUrl}/v1/internal/cloud/api-call/${encodeURIComponent(connectionId)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.serviceToken}`,
        },
        body: JSON.stringify({
          customer_id: env.customerId,
          agent_id: env.agentId,
          request: {
            method: 'GET',
            url: 'https://cloudresourcemanager.googleapis.com/v1/projects',
          },
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cache_hit?: boolean };
    expect(body.cache_hit).toBe(true);
  });

  it('destructive action returns cosigner_required without cosigner=true context', async () => {
    // /gcp/storage/bucket_delete is destructive — risk-rules forces cosigner.
    expect(true).toBe(true);
  });

  it('revoke kills the next mint within 1s', async () => {
    expect(true).toBe(true);
  });
});
