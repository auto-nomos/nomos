import { describe, expect, it } from 'vitest';
import { signSigV4 } from '../aws-sigv4.js';

const TEST_CREDS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

const TEST_DATE = new Date(Date.UTC(2015, 7, 30, 12, 36, 0));

describe('signSigV4', () => {
  it('returns x-amz-date, x-amz-content-sha256, authorization headers', () => {
    const { headers } = signSigV4(TEST_CREDS, {
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      region: 'us-east-1',
      service: 'iam',
      now: TEST_DATE,
    });
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    expect(headers.authorization).toContain('SignedHeaders=');
    expect(headers.authorization).toContain('Signature=');
  });

  it('produces a stable signature for the same input', () => {
    const a = signSigV4(TEST_CREDS, {
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      region: 'us-east-1',
      service: 'iam',
      now: TEST_DATE,
    });
    const b = signSigV4(TEST_CREDS, {
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      region: 'us-east-1',
      service: 'iam',
      now: TEST_DATE,
    });
    expect(a.headers.authorization).toBe(b.headers.authorization);
  });

  it('includes session token when present', () => {
    const { headers } = signSigV4(
      { ...TEST_CREDS, sessionToken: 'SESS-TOKEN-XYZ' },
      {
        method: 'GET',
        url: 'https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15',
        region: 'us-east-1',
        service: 'ec2',
        now: TEST_DATE,
      },
    );
    expect(headers['x-amz-security-token']).toBe('SESS-TOKEN-XYZ');
    expect(headers.authorization).toContain('x-amz-security-token');
  });

  it('hashes the request body', () => {
    const { headers } = signSigV4(TEST_CREDS, {
      method: 'POST',
      url: 'https://dynamodb.us-east-1.amazonaws.com/',
      region: 'us-east-1',
      service: 'dynamodb',
      body: '{"TableName":"foo"}',
      now: TEST_DATE,
    });
    // sha256("{"TableName":"foo"}") — deterministic
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-amz-content-sha256']).not.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('differs when method changes', () => {
    const get = signSigV4(TEST_CREDS, {
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=X',
      region: 'us-east-1',
      service: 'iam',
      now: TEST_DATE,
    });
    const post = signSigV4(TEST_CREDS, {
      method: 'POST',
      url: 'https://iam.amazonaws.com/?Action=X',
      region: 'us-east-1',
      service: 'iam',
      now: TEST_DATE,
    });
    expect(get.headers.authorization).not.toBe(post.headers.authorization);
  });
});
