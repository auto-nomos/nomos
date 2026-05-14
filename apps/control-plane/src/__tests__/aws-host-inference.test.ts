import { describe, expect, it } from 'vitest';
import { inferServiceAndRegion } from '../cloud/providers/aws.js';

const DEFAULT_REGION = 'us-east-1';

describe('inferServiceAndRegion', () => {
  it('regional service endpoints', () => {
    expect(inferServiceAndRegion('https://sts.us-east-1.amazonaws.com/', DEFAULT_REGION)).toEqual({
      service: 'sts',
      region: 'us-east-1',
    });
    expect(inferServiceAndRegion('https://ec2.eu-west-1.amazonaws.com/', DEFAULT_REGION)).toEqual({
      service: 'ec2',
      region: 'eu-west-1',
    });
    expect(
      inferServiceAndRegion('https://sqs.ap-southeast-2.amazonaws.com/', DEFAULT_REGION),
    ).toEqual({ service: 'sqs', region: 'ap-southeast-2' });
  });

  it('global services (iam, route53) use default region', () => {
    expect(inferServiceAndRegion('https://iam.amazonaws.com/', DEFAULT_REGION)).toEqual({
      service: 'iam',
      region: DEFAULT_REGION,
    });
    expect(inferServiceAndRegion('https://route53.amazonaws.com/', DEFAULT_REGION)).toEqual({
      service: 'route53',
      region: DEFAULT_REGION,
    });
  });

  it('S3 virtual-hosted', () => {
    expect(
      inferServiceAndRegion('https://mybucket.s3.us-east-1.amazonaws.com/foo', DEFAULT_REGION),
    ).toEqual({ service: 's3', region: 'us-east-1' });
  });

  it('S3 regional path-style', () => {
    expect(
      inferServiceAndRegion('https://s3.us-west-2.amazonaws.com/mybucket/foo', DEFAULT_REGION),
    ).toEqual({ service: 's3', region: 'us-west-2' });
  });

  it('dualstack endpoints', () => {
    expect(
      inferServiceAndRegion('https://s3.dualstack.us-east-1.amazonaws.com/', DEFAULT_REGION),
    ).toEqual({ service: 's3', region: 'us-east-1' });
    expect(
      inferServiceAndRegion('https://ec2.dualstack.eu-west-1.amazonaws.com/', DEFAULT_REGION),
    ).toEqual({ service: 'ec2', region: 'eu-west-1' });
  });

  it('GovCloud regional', () => {
    expect(
      inferServiceAndRegion('https://sts.us-gov-west-1.amazonaws.com/', DEFAULT_REGION),
    ).toEqual({ service: 'sts', region: 'us-gov-west-1' });
  });

  it('non-aws hosts fall back to defaults', () => {
    expect(inferServiceAndRegion('https://api.example.com/foo', DEFAULT_REGION)).toEqual({
      service: 'execute-api',
      region: DEFAULT_REGION,
    });
  });
});
