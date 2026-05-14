import type { AuthorizeDecision } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import {
  commandIsDestructive,
  isCloudCommand,
  shouldForceStepUp,
} from '../services/cloud-risk-rules.js';

const allow: AuthorizeDecision = { allow: true, reason: 'allowed', receiptId: 'r' };

describe('cloud-risk-rules', () => {
  it('isCloudCommand matches azure/aws/gcp prefixes', () => {
    expect(isCloudCommand('/azure/vm/list')).toBe(true);
    expect(isCloudCommand('/aws/ec2/list_instances')).toBe(true);
    expect(isCloudCommand('/gcp/projects/list')).toBe(true);
    expect(isCloudCommand('/github/repo/read')).toBe(false);
  });

  it('commandIsDestructive matches destructive verbs', () => {
    expect(commandIsDestructive('/azure/vm/delete')).toBe(true);
    expect(commandIsDestructive('/aws/ec2/terminate_instance')).toBe(true);
    expect(commandIsDestructive('/gcp/storage/object_delete')).toBe(true);
    expect(commandIsDestructive('/azure/vm/stop')).toBe(true);
    expect(commandIsDestructive('/azure/vm/run_command')).toBe(true);
  });

  it('commandIsDestructive ignores read verbs', () => {
    expect(commandIsDestructive('/azure/vm/list')).toBe(false);
    expect(commandIsDestructive('/aws/cloudwatch/get_logs')).toBe(false);
    expect(commandIsDestructive('/gcp/bigquery/query')).toBe(false);
  });

  it('shouldForceStepUp diverts allow → step-up for destructive actions', () => {
    expect(
      shouldForceStepUp(allow, {
        request: {
          command: '/azure/vm/delete',
          principal: { type: 'Agent', id: 'a' },
          action: { type: 'Action', id: '/azure/vm/delete' },
          resource: { type: 'Resource', id: 'vm' },
          context: {},
        },
      }),
    ).toBe(true);
  });

  it('shouldForceStepUp allows when cosigner already true', () => {
    expect(
      shouldForceStepUp(allow, {
        request: {
          command: '/azure/vm/delete',
          principal: { type: 'Agent', id: 'a' },
          action: { type: 'Action', id: '/azure/vm/delete' },
          resource: { type: 'Resource', id: 'vm' },
          context: { cosigner: true },
        },
      }),
    ).toBe(false);
  });

  it('shouldForceStepUp passes reads through unchanged', () => {
    expect(
      shouldForceStepUp(allow, {
        request: {
          command: '/azure/vm/list',
          principal: { type: 'Agent', id: 'a' },
          action: { type: 'Action', id: '/azure/vm/list' },
          resource: { type: 'Resource', id: '' },
          context: {},
        },
      }),
    ).toBe(false);
  });
});
