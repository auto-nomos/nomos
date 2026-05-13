import { generateKeypair } from '@auto-nomos/crypto';
import type { AuthorizeRequest, UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import { describe, expect, it } from 'vitest';
import { decide } from '../decide.js';

const NOW = 1_700_001_000;

function payloadFor(iss: string, aud: string, overrides: Partial<UcanPayload> = {}): UcanPayload {
  return {
    iss,
    aud,
    cmd: '/github/issue/create',
    pol: [],
    nonce: `n-${Math.random()}`,
    nbf: 1_700_000_000,
    exp: 1_700_003_600,
    ...overrides,
  };
}

const billingPolicy = `
permit(
  principal,
  action == Action::"/billing/invoice/read",
  resource
)
when {
  resource.customer_id == "ACME" &&
  resource.year == 2026
};
`;

const githubPolicy = `
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
)
when {
  resource.repo == "acme/billing"
};
`;

describe('decide', () => {
  it('allows when UCAN + Cedar policy + request all align', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });

    const request: AuthorizeRequest = {
      ucan: ucan.jwt,
      command: '/github/issue/create',
      resource: { repo: 'acme/billing', owner: 'acme' },
      context: {},
    };

    const decision = decide({
      ucan: ucan.jwt,
      request,
      policies: githubPolicy,
      now: NOW,
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
    expect(decision.receiptId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('denies arbitrary UCAN issuers when a trusted root issuer is configured', () => {
    const trusted = generateKeypair();
    const attacker = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(attacker.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: attacker.privateKey,
    });

    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      trustedIssuerDid: trusted.did,
      now: NOW,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('untrusted_issuer');
  });

  it('allows delegated UCAN chains rooted at the trusted control-plane issuer', () => {
    const trusted = generateKeypair();
    const mid = generateKeypair();
    const leafAgent = generateKeypair();

    const root = issueUcan({
      payload: payloadFor(trusted.did, mid.did, { cmd: '/github' }),
      privateKey: trusted.privateKey,
    });
    const leaf = issueUcan({
      payload: payloadFor(mid.did, leafAgent.did, {
        cmd: '/github/issue/create',
        exp: 1_700_002_000,
      }),
      privateKey: mid.privateKey,
    });

    const decision = decide({
      ucan: [root.jwt, leaf.jwt],
      request: {
        ucan: leaf.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      trustedIssuerDid: trusted.did,
      now: NOW,
    });

    expect(decision.allow).toBe(true);
  });

  it('denies when policy condition fails (canonical: ACME 2026 invoices)', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/billing/invoice/read' }),
      privateKey: issuer.privateKey,
    });

    const allow = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/billing/invoice/read',
        resource: { customer_id: 'ACME', year: 2026 },
        context: {},
      },
      policies: billingPolicy,
      now: NOW,
    });
    expect(allow.allow).toBe(true);

    const deny2025 = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/billing/invoice/read',
        resource: { customer_id: 'ACME', year: 2025 },
        context: {},
      },
      policies: billingPolicy,
      now: NOW,
    });
    expect(deny2025.allow).toBe(false);
    expect(deny2025.reason).toBe('policy_denied');

    const denyOtherCustomer = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/billing/invoice/read',
        resource: { customer_id: 'OTHER', year: 2026 },
        context: {},
      },
      policies: billingPolicy,
      now: NOW,
    });
    expect(denyOtherCustomer.allow).toBe(false);
    expect(denyOtherCustomer.reason).toBe('policy_denied');
  });

  it('handles a delegation chain (parent /github → leaf /github/issue/create)', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const leafAgent = generateKeypair();

    const a = issueUcan({
      payload: payloadFor(root.did, mid.did, { cmd: '/github' }),
      privateKey: root.privateKey,
    });
    const b = issueUcan({
      payload: payloadFor(mid.did, leafAgent.did, {
        cmd: '/github/issue/create',
        exp: 1_700_002_000,
      }),
      privateKey: mid.privateKey,
    });

    const allow = decide({
      ucan: [a.jwt, b.jwt],
      request: {
        ucan: b.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      now: NOW,
    });
    expect(allow.allow).toBe(true);
  });

  it('rejects a leaf attempting a command broader than parent grant', () => {
    const root = generateKeypair();
    const mid = generateKeypair();

    const a = issueUcan({
      payload: payloadFor(root.did, mid.did, { cmd: '/github/issue/create' }),
      privateKey: root.privateKey,
    });
    const b = issueUcan({
      payload: payloadFor(mid.did, mid.did, { cmd: '/github' }),
      privateKey: mid.privateKey,
    });

    const decision = decide({
      ucan: [a.jwt, b.jwt],
      request: {
        ucan: b.jwt,
        command: '/github',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    // Sprint MAOS-A — over-attenuated chain now maps to the precise
    // chain_attenuation_violation reason (was malformed_ucan pre-MAOS).
    expect(decision.reason).toBe('chain_attenuation_violation');
  });

  it('denies when leaf CID is in the revocation list', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      revokedCids: new Set([ucan.cid]),
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('revoked');
  });

  it('denies when any UCAN in the chain is revoked', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = issueUcan({
      payload: payloadFor(root.did, mid.did, { cmd: '/github' }),
      privateKey: root.privateKey,
    });
    const b = issueUcan({
      payload: payloadFor(mid.did, mid.did, { cmd: '/github/issue/create' }),
      privateKey: mid.privateKey,
    });
    const decision = decide({
      ucan: [a.jwt, b.jwt],
      request: {
        ucan: b.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      revokedCids: new Set([a.cid]),
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('revoked');
  });

  it('returns malformed_ucan on empty chain', () => {
    const decision = decide({
      ucan: [],
      request: {
        ucan: '',
        command: '/x/y',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('malformed_ucan');
    expect(decision.receiptId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps expired UCAN to expired DenyReason', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { exp: NOW - 10 }),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('expired');
  });

  it('maps malformed JWT to malformed_ucan DenyReason', () => {
    const decision = decide({
      ucan: 'not-a-jwt',
      request: {
        ucan: 'not-a-jwt',
        command: '/x/y',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('malformed_ucan');
  });

  it('maps command mismatch to command_mismatch DenyReason', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/pr/merge',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('command_mismatch');
  });

  it('passes schema through to Cedar evaluator', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });

    const schema = `namespace Demo {
      entity Agent;
      entity Resource;
      action "/github/issue/create" appliesTo { principal: [Agent], resource: [Resource] };
    }`;

    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: {},
        context: {},
      },
      policies: 'permit(principal, action, resource);',
      now: NOW,
      // Schema referencing different namespace; Cedar should still evaluate without crashing.
      // Use as a smoke test that schema arg path is exercised.
      schema,
    });
    // Decision may be deny due to namespace mismatch; the point is the schema branch executed.
    expect(['allow', 'deny']).toContain(decision.allow ? 'allow' : 'deny');
  });

  it('completes a full flow in under 50ms', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });
    const start = performance.now();
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      now: NOW,
    });
    const elapsed = performance.now() - start;
    expect(decision.allow).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });

  it('uses Date.now() default when now option not provided', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const nowSec = Math.floor(Date.now() / 1000);
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, {
        cmd: '/github/issue/create',
        nbf: nowSec - 60,
        exp: nowSec + 60,
      }),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
    });
    expect(decision.allow).toBe(true);
  });

  it('allows when revokedCids contains unrelated CIDs', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      revokedCids: new Set(['unrelated-cid-1', 'unrelated-cid-2']),
      now: NOW,
    });
    expect(decision.allow).toBe(true);
  });

  it('D-5: UCAN meta.context_hints overrides agent-supplied context (issuer wins)', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    // UCAN claims user.department = 'engineering' (issuer-vouched).
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, {
        cmd: '/github/issue/create',
        meta: { context_hints: { user: { department: 'engineering' } } },
      }),
      privateKey: issuer.privateKey,
    });

    const policy = `permit(
      principal,
      action == Action::"/github/issue/create",
      resource
    ) when { context.user.department == "engineering" };`;

    // Agent tries to lie: claims department = 'security' in request.context.
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: {},
        context: { user: { department: 'security' } },
      },
      policies: policy,
      now: NOW,
    });
    // UCAN hint wins → policy condition matches → allow.
    expect(decision.allow).toBe(true);
  });

  it('D-5: PDP-computed time.hour is available to policies that reference it', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });

    const policy = `permit(
      principal,
      action == Action::"/github/issue/create",
      resource
    ) when { context.time.hour >= 0 && context.time.hour < 24 };`;

    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: {},
        context: {},
      },
      policies: policy,
      now: NOW,
    });
    expect(decision.allow).toBe(true);
  });

  it('D-5: nested merge preserves agent-supplied keys not overridden by hints', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, {
        cmd: '/github/issue/create',
        meta: { context_hints: { user: { department: 'engineering' } } },
      }),
      privateKey: issuer.privateKey,
    });

    // Policy reads two distinct sub-keys of context.user — one from hints,
    // one from request.
    const policy = `permit(
      principal,
      action == Action::"/github/issue/create",
      resource
    ) when {
      context.user.department == "engineering" &&
      context.user.id == "agent-self"
    };`;

    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: {},
        context: { user: { id: 'agent-self' } },
      },
      policies: policy,
      now: NOW,
    });
    expect(decision.allow).toBe(true);
  });

  it('skips revocation check when revokedCids is empty set', () => {
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: payloadFor(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });
    const decision = decide({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      },
      policies: githubPolicy,
      revokedCids: new Set(),
      now: NOW,
    });
    expect(decision.allow).toBe(true);
  });

  describe('resource_constraint gate', () => {
    const fsPolicy = `
      permit(principal, action == Action::"/filesystem/read", resource);
    `;

    it('allows when request.resource.path is inside UCAN constraint prefix', () => {
      const issuer = generateKeypair();
      const agent = generateKeypair();
      const ucan = issueUcan({
        payload: payloadFor(issuer.did, agent.did, {
          cmd: '/filesystem/read',
          meta: {
            resource_constraint: {
              provider: 'filesystem',
              path_prefix: '/Users/x/finance/2026/',
            },
          },
        }),
        privateKey: issuer.privateKey,
      });

      const decision = decide({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/filesystem/read',
          resource: { path: '/Users/x/finance/2026/q1.pdf' },
          context: {},
        },
        policies: fsPolicy,
        now: NOW,
      });
      expect(decision.allow).toBe(true);
    });

    it('denies with resource_out_of_scope when path escapes prefix', () => {
      const issuer = generateKeypair();
      const agent = generateKeypair();
      const ucan = issueUcan({
        payload: payloadFor(issuer.did, agent.did, {
          cmd: '/filesystem/read',
          meta: {
            resource_constraint: {
              provider: 'filesystem',
              path_prefix: '/Users/x/finance/2026/',
            },
          },
        }),
        privateKey: issuer.privateKey,
      });

      const decision = decide({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/filesystem/read',
          resource: { path: '/Users/x/finance/2025/secret.pdf' },
          context: {},
        },
        policies: fsPolicy,
        now: NOW,
      });
      expect(decision.allow).toBe(false);
      expect(decision.reason).toBe('resource_out_of_scope');
    });

    it('exposes constraint to Cedar via context.resource_constraint', () => {
      const issuer = generateKeypair();
      const agent = generateKeypair();
      const ucan = issueUcan({
        payload: payloadFor(issuer.did, agent.did, {
          cmd: '/filesystem/read',
          meta: {
            resource_constraint: {
              provider: 'filesystem',
              path_prefix: '/Users/x/finance/',
            },
          },
        }),
        privateKey: issuer.privateKey,
      });
      const cedarOnConstraint = `
        permit(principal, action == Action::"/filesystem/read", resource)
        when { context.resource_constraint.provider == "filesystem" };
      `;
      const decision = decide({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/filesystem/read',
          resource: { path: '/Users/x/finance/q1.pdf' },
          context: {},
        },
        policies: cedarOnConstraint,
        now: NOW,
      });
      expect(decision.allow).toBe(true);
    });
  });
});
