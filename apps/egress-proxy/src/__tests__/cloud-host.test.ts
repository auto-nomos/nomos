import { describe, expect, it } from 'vitest';
import { checkCloudConnect, detectCloudHost } from '../cloud-host.js';

describe('detectCloudHost', () => {
  it('matches Azure ARM', () => {
    expect(detectCloudHost('management.azure.com')).toEqual({ connector: 'azure', service: 'arm' });
  });
  it('matches Azure AAD', () => {
    expect(detectCloudHost('login.microsoftonline.com')).toEqual({
      connector: 'azure',
      service: 'aad',
    });
  });
  it('matches AWS regional service hosts', () => {
    expect(detectCloudHost('sts.us-east-1.amazonaws.com')).toEqual({
      connector: 'aws',
      service: 'sts',
      region: 'us-east-1',
    });
    expect(detectCloudHost('ec2.eu-west-1.amazonaws.com')).toEqual({
      connector: 'aws',
      service: 'ec2',
      region: 'eu-west-1',
    });
  });
  it('matches AWS S3 virtual-hosted', () => {
    expect(detectCloudHost('mybucket.s3.us-east-1.amazonaws.com')).toEqual({
      connector: 'aws',
      service: 's3',
      region: 'us-east-1',
    });
  });
  it('matches GCP googleapis hosts', () => {
    expect(detectCloudHost('storage.googleapis.com')).toEqual({
      connector: 'gcp',
      service: 'storage',
    });
    expect(detectCloudHost('iamcredentials.googleapis.com')).toEqual({
      connector: 'gcp',
      service: 'iamcredentials',
    });
  });
  it('returns null for non-cloud hosts', () => {
    expect(detectCloudHost('api.github.com')).toBeNull();
    expect(detectCloudHost('slack.com')).toBeNull();
    expect(detectCloudHost('example.test')).toBeNull();
  });
});

describe('checkCloudConnect', () => {
  it('allows non-cloud hosts regardless of token', () => {
    expect(
      checkCloudConnect('api.github.com', undefined, {
        requireTokenForClouds: true,
        expectedToken: 't',
      }).allow,
    ).toBe(true);
  });
  it('allows cloud hosts when enforcement is off', () => {
    expect(
      checkCloudConnect('management.azure.com', undefined, { requireTokenForClouds: false }).allow,
    ).toBe(true);
  });
  it('denies cloud CONNECT without matching token', () => {
    const verdict = checkCloudConnect('management.azure.com', 'Bearer wrong', {
      requireTokenForClouds: true,
      expectedToken: 'right',
    });
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('connector=azure');
  });
  it('allows cloud CONNECT with matching token', () => {
    expect(
      checkCloudConnect('management.azure.com', 'Bearer right', {
        requireTokenForClouds: true,
        expectedToken: 'right',
      }).allow,
    ).toBe(true);
  });
});
