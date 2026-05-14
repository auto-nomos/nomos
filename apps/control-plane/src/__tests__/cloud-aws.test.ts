import type { CloudConnectionRef } from '@auto-nomos/core';
import { describe, expect, it, vi } from 'vitest';
import { AwsCloudProvider } from '../cloud/providers/aws.js';

function fixtureConnection(): CloudConnectionRef {
  return {
    id: 'conn-aws',
    customerId: 'cust',
    connector: 'aws',
    accountId: '123456789012',
    tenantId: null,
    externalId: 'arn:aws:iam::123456789012:role/nomos',
    config: {
      role_arn: 'arn:aws:iam::123456789012:role/nomos',
      region: 'us-east-1',
    },
  };
}

const STS_XML = `<AssumeRoleWithWebIdentityResponse>
  <AssumeRoleWithWebIdentityResult>
    <Credentials>
      <AccessKeyId>AKID-FED-XYZ</AccessKeyId>
      <SecretAccessKey>SECRET-FED-XYZ</SecretAccessKey>
      <SessionToken>SESS-FED-XYZ</SessionToken>
      <Expiration>2030-01-01T00:00:00Z</Expiration>
    </Credentials>
  </AssumeRoleWithWebIdentityResult>
</AssumeRoleWithWebIdentityResponse>`;

describe('AwsCloudProvider.acquireSessionCreds', () => {
  it('parses STS XML response and returns aws_sigv4 creds', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      expect(String(url)).toMatch(
        /^https:\/\/sts\.us-east-1\.amazonaws\.com\/\?Action=AssumeRoleWithWebIdentity/,
      );
      return new Response(STS_XML, {
        status: 200,
        headers: { 'content-type': 'text/xml' },
      });
    }) as unknown as typeof fetch;
    const provider = new AwsCloudProvider({ fetch: fetchMock });
    const creds = await provider.acquireSessionCreds(fixtureConnection(), 'oidc-id-token');
    expect(creds.kind).toBe('aws_sigv4');
    if (creds.kind === 'aws_sigv4') {
      expect(creds.accessKeyId).toBe('AKID-FED-XYZ');
      expect(creds.secretAccessKey).toBe('SECRET-FED-XYZ');
      expect(creds.sessionToken).toBe('SESS-FED-XYZ');
      expect(creds.region).toBe('us-east-1');
    }
  });

  it('rejects connections without role_arn', async () => {
    const provider = new AwsCloudProvider({ fetch: vi.fn() as unknown as typeof fetch });
    await expect(
      provider.acquireSessionCreds({ ...fixtureConnection(), config: {} }, 'token'),
    ).rejects.toThrow(/missing_role_arn/);
  });

  it('marks 5xx/429 retryable', async () => {
    const fetchMock = vi.fn(
      async () => new Response('throttled', { status: 429 }),
    ) as unknown as typeof fetch;
    const provider = new AwsCloudProvider({ fetch: fetchMock });
    try {
      await provider.acquireSessionCreds(fixtureConnection(), 't');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as { retryable?: boolean }).retryable).toBe(true);
    }
  });
});

describe('AwsCloudProvider.signAndCall', () => {
  it('signs ARM-style URL and attaches authorization', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        'https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15',
      );
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response('{"Instances":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const provider = new AwsCloudProvider({ fetch: fetchMock });
    const res = await provider.signAndCall(
      {
        kind: 'aws_sigv4',
        accessKeyId: 'AK',
        secretAccessKey: 'SK',
        sessionToken: 'ST',
        expiresAt: new Date(Date.now() + 60_000),
        region: 'us-east-1',
      },
      {
        method: 'GET',
        url: 'https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15',
      },
    );
    expect(res.status).toBe(200);
    expect(capturedHeaders?.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(capturedHeaders?.['x-amz-security-token']).toBe('ST');
  });
});
