import { describe, expect, it, vi } from 'vitest';
import { cedarBinding } from '../binding.js';
import { evaluate } from '../evaluate.js';
import type { EntityUid } from '../types.js';

const alice: EntityUid = { type: 'User', id: 'alice' };
const bob: EntityUid = { type: 'User', id: 'bob' };
const readAction: EntityUid = { type: 'Action', id: 'read' };
const writeAction: EntityUid = { type: 'Action', id: 'write' };
const doc1: EntityUid = { type: 'Document', id: 'doc1' };

describe('evaluate (no schema)', () => {
  it('allows when permit matches everything', () => {
    const res = evaluate({
      policies: 'permit(principal, action, resource);',
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
    });
    expect(res.decision).toBe('allow');
    expect(res.reason.length).toBeGreaterThan(0);
  });

  it('denies when no permit matches', () => {
    const res = evaluate({
      policies: 'permit(principal == User::"alice", action == Action::"write", resource);',
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
    });
    expect(res.decision).toBe('deny');
  });

  it('denies when only a forbid policy is present', () => {
    const res = evaluate({
      policies: 'forbid(principal, action, resource);',
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
    });
    expect(res.decision).toBe('deny');
  });

  it('forbid overrides permit', () => {
    const text = `
      permit(principal, action, resource);
      forbid(principal == User::"alice", action, resource);
    `;
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('deny');
    expect(
      evaluate({ policies: text, principal: bob, action: readAction, resource: doc1, context: {} })
        .decision,
    ).toBe('allow');
  });

  it('matches principal == User::"alice" exactly', () => {
    const text = 'permit(principal == User::"alice", action, resource);';
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('allow');
    expect(
      evaluate({ policies: text, principal: bob, action: readAction, resource: doc1, context: {} })
        .decision,
    ).toBe('deny');
  });

  it('matches action == Action::"read"', () => {
    const text = 'permit(principal, action == Action::"read", resource);';
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('allow');
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: writeAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('deny');
  });

  it('checks resource attribute equality via parents/attrs', () => {
    const text = `permit(principal, action, resource) when { resource.owner == "alice" };`;
    const allow = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: { type: 'Document', id: 'doc1' },
      context: {},
      entities: [
        {
          uid: { type: 'Document', id: 'doc1' },
          attrs: { owner: 'alice' },
          parents: [],
        },
      ],
    });
    expect(allow.decision).toBe('allow');
    const deny = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: { type: 'Document', id: 'doc2' },
      context: {},
      entities: [
        {
          uid: { type: 'Document', id: 'doc2' },
          attrs: { owner: 'bob' },
          parents: [],
        },
      ],
    });
    expect(deny.decision).toBe('deny');
  });

  it('supports principal in Group::"admins"', () => {
    const text = `permit(principal in Group::"admins", action, resource);`;
    const res = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
      entities: [
        {
          uid: { type: 'User', id: 'alice' },
          attrs: {},
          parents: [{ type: 'Group', id: 'admins' }],
        },
      ],
    });
    expect(res.decision).toBe('allow');
  });

  it('supports time-of-day conditions via context', () => {
    const text = `
      permit(principal, action, resource)
      when { context.hour >= 9 && context.hour <= 18 };
    `;
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: { hour: 14 },
      }).decision,
    ).toBe('allow');
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: { hour: 22 },
      }).decision,
    ).toBe('deny');
  });

  it('handles multiple permits where any match yields allow', () => {
    const text = `
      permit(principal == User::"alice", action, resource);
      permit(principal == User::"bob", action, resource);
    `;
    expect(
      evaluate({
        policies: text,
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('allow');
    expect(
      evaluate({ policies: text, principal: bob, action: readAction, resource: doc1, context: {} })
        .decision,
    ).toBe('allow');
    expect(
      evaluate({
        policies: text,
        principal: { type: 'User', id: 'eve' },
        action: readAction,
        resource: doc1,
        context: {},
      }).decision,
    ).toBe('deny');
  });

  it('returns deny + errors when policies are malformed', () => {
    const res = evaluate({
      policies: 'this is not valid cedar',
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
    });
    expect(res.decision).toBe('deny');
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('returns deny when context predicate references missing attribute', () => {
    const text = `permit(principal, action, resource) when { context.region == "us-east" };`;
    const res = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: doc1,
      context: {},
    });
    expect(res.decision).toBe('deny');
  });

  it('supports `like` operator for path-prefix glob matching', () => {
    const text = `
      permit(principal, action, resource)
      when { resource.path like "finance/2026/*" };
    `;
    const allow = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: { type: 'File', id: 'f1' },
      context: {},
      entities: [
        {
          uid: { type: 'File', id: 'f1' },
          attrs: { path: 'finance/2026/q1/report.pdf' },
          parents: [],
        },
      ],
    });
    expect(allow.decision).toBe('allow');

    const deny = evaluate({
      policies: text,
      principal: alice,
      action: readAction,
      resource: { type: 'File', id: 'f2' },
      context: {},
      entities: [
        {
          uid: { type: 'File', id: 'f2' },
          attrs: { path: 'finance/2025/q4/report.pdf' },
          parents: [],
        },
      ],
    });
    expect(deny.decision).toBe('deny');
  });

  it('canonical billing-agent example: ACME 2026 invoices', () => {
    const billingAgent: EntityUid = { type: 'BillingAgent', id: 'billing-1' };
    const invoice2026: EntityUid = { type: 'Invoice', id: 'inv-1' };
    const text = `
      permit(
        principal in BillingAgentGroup::"billing-agents",
        action == Action::"ReadInvoice",
        resource
      )
      when {
        resource.customer_id == "ACME" &&
        resource.year == 2026 &&
        context.hour >= 9 && context.hour <= 18
      };
    `;
    const allow = evaluate({
      policies: text,
      principal: billingAgent,
      action: { type: 'Action', id: 'ReadInvoice' },
      resource: invoice2026,
      context: { hour: 14 },
      entities: [
        {
          uid: billingAgent,
          attrs: {},
          parents: [{ type: 'BillingAgentGroup', id: 'billing-agents' }],
        },
        {
          uid: invoice2026,
          attrs: { customer_id: 'ACME', year: 2026 },
          parents: [],
        },
      ],
    });
    expect(allow.decision).toBe('allow');

    const denyOffHours = evaluate({
      policies: text,
      principal: billingAgent,
      action: { type: 'Action', id: 'ReadInvoice' },
      resource: invoice2026,
      context: { hour: 23 },
      entities: [
        {
          uid: billingAgent,
          attrs: {},
          parents: [{ type: 'BillingAgentGroup', id: 'billing-agents' }],
        },
        {
          uid: invoice2026,
          attrs: { customer_id: 'ACME', year: 2026 },
          parents: [],
        },
      ],
    });
    expect(denyOffHours.decision).toBe('deny');

    const denyWrongCustomer = evaluate({
      policies: text,
      principal: billingAgent,
      action: { type: 'Action', id: 'ReadInvoice' },
      resource: { type: 'Invoice', id: 'inv-2' },
      context: { hour: 14 },
      entities: [
        {
          uid: billingAgent,
          attrs: {},
          parents: [{ type: 'BillingAgentGroup', id: 'billing-agents' }],
        },
        {
          uid: { type: 'Invoice', id: 'inv-2' },
          attrs: { customer_id: 'OTHER', year: 2026 },
          parents: [],
        },
      ],
    });
    expect(denyWrongCustomer.decision).toBe('deny');
  });
});

describe('evaluate (failure + warning paths)', () => {
  it('passes warnings through on isAuthorized failure', () => {
    const spy = vi.spyOn(cedarBinding, 'isAuthorized').mockReturnValue({
      type: 'failure',
      errors: [
        {
          message: 'fatal',
          code: null,
          help: null,
          severity: null,
          url: null,
        },
      ],
      warnings: [
        {
          message: 'caution',
          code: null,
          help: null,
          severity: null,
          url: null,
        },
      ],
    });
    try {
      const res = evaluate({
        policies: 'permit(principal, action, resource);',
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      });
      expect(res.decision).toBe('deny');
      expect(res.errors).toContain('fatal');
      expect(res.warnings).toContain('caution');
    } finally {
      spy.mockRestore();
    }
  });

  it('passes warnings through on isAuthorized success', () => {
    const spy = vi.spyOn(cedarBinding, 'isAuthorized').mockReturnValue({
      type: 'success',
      response: {
        decision: 'allow',
        diagnostics: { reason: ['policy0'], errors: [] },
      },
      warnings: [
        {
          message: 'note',
          code: null,
          help: null,
          severity: null,
          url: null,
        },
      ],
    });
    try {
      const res = evaluate({
        policies: 'permit(principal, action, resource);',
        principal: alice,
        action: readAction,
        resource: doc1,
        context: {},
      });
      expect(res.decision).toBe('allow');
      expect(res.warnings).toContain('note');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('evaluate (with schema)', () => {
  const schema = {
    Demo: {
      entityTypes: {
        User: { shape: { type: 'Record', attributes: {} } },
        Document: {
          shape: {
            type: 'Record',
            attributes: { owner: { type: 'String' } },
          },
        },
      },
      actions: {
        read: {
          appliesTo: { principalTypes: ['Demo::User'], resourceTypes: ['Demo::Document'] },
        },
      },
    },
  };

  it('evaluates successfully when policies + entities conform to schema', () => {
    const res = evaluate({
      policies: `permit(principal, action == Demo::Action::"read", resource);`,
      principal: { type: 'Demo::User', id: 'alice' },
      action: { type: 'Demo::Action', id: 'read' },
      resource: { type: 'Demo::Document', id: 'doc1' },
      context: {},
      entities: [
        {
          uid: { type: 'Demo::Document', id: 'doc1' },
          attrs: { owner: 'alice' },
          parents: [],
        },
      ],
      schema,
    });
    expect(res.decision).toBe('allow');
  });
});
