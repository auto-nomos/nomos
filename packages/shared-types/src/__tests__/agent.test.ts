import { describe, expect, it } from 'vitest';
import { AgentRecord, MintUcanInput } from '../agent.js';

const cust = '550e8400-e29b-41d4-a716-446655440000';
const agent = '550e8400-e29b-41d4-a716-446655440003';
const policy = '550e8400-e29b-41d4-a716-446655440004';

describe('AgentRecord', () => {
  const validAgent = {
    id: agent,
    customer_id: cust,
    did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    name: 'Billing agent',
    description: 'Reads ACME invoices',
    status: 'active' as const,
    created_at: 1_700_000_000_000,
    last_active_at: 1_700_000_000_000,
  };

  it('parses a valid agent record', () => {
    expect(() => AgentRecord.parse(validAgent)).not.toThrow();
  });

  it('accepts optional last_active_at and description', () => {
    const { last_active_at: _l, description: _d, ...minimal } = validAgent;
    expect(() => AgentRecord.parse(minimal)).not.toThrow();
  });

  it('rejects empty name', () => {
    expect(() => AgentRecord.parse({ ...validAgent, name: '' })).toThrow();
  });

  it('rejects too-long name', () => {
    expect(() => AgentRecord.parse({ ...validAgent, name: 'x'.repeat(101) })).toThrow();
  });

  it('rejects unknown status', () => {
    expect(() =>
      AgentRecord.parse({ ...validAgent, status: 'banana' as unknown as 'active' }),
    ).toThrow();
  });

  it('rejects bad DID', () => {
    expect(() => AgentRecord.parse({ ...validAgent, did: 'not-a-did' })).toThrow();
  });
});

describe('MintUcanInput', () => {
  const validInput = {
    agent_id: agent,
    command: '/github/issue/create',
    policy_id: policy,
    ttl_seconds: 3600,
  };

  it('parses a valid input', () => {
    expect(() => MintUcanInput.parse(validInput)).not.toThrow();
  });

  it('accepts optional resource_subject and meta', () => {
    expect(() =>
      MintUcanInput.parse({
        ...validInput,
        resource_subject: 'acme/billing',
        meta: { source: 'dashboard' },
      }),
    ).not.toThrow();
  });

  it('rejects ttl_seconds > 86400', () => {
    expect(() => MintUcanInput.parse({ ...validInput, ttl_seconds: 86_401 })).toThrow();
  });

  it('rejects ttl_seconds <= 0', () => {
    expect(() => MintUcanInput.parse({ ...validInput, ttl_seconds: 0 })).toThrow();
    expect(() => MintUcanInput.parse({ ...validInput, ttl_seconds: -1 })).toThrow();
  });

  it('rejects bad command', () => {
    expect(() => MintUcanInput.parse({ ...validInput, command: 'bad' })).toThrow();
  });
});
