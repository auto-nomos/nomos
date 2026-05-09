import { randomUUID } from 'node:crypto';
import { generateKeypair, sha256Hex, signDetached } from '@credential-broker/crypto';
import { canonicalize } from '@credential-broker/ucan';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { type AuditBundle, type AuditBundleEvent, verifyBundle } from '../verify.js';

const ZERO_HASH = '0'.repeat(64);

interface BuildOpts {
  count: number;
  customerId?: string;
}

const kp = generateKeypair();
const verifyKey = bytesToHex(kp.publicKey);

function buildChain(opts: BuildOpts): AuditBundleEvent[] {
  const customerId = opts.customerId ?? randomUUID();
  let prevHash = ZERO_HASH;
  const events: AuditBundleEvent[] = [];
  for (let i = 0; i < opts.count; i++) {
    const eventId = randomUUID();
    const payload = {
      event_id: eventId,
      prev_hash: prevHash,
      customer_id: customerId,
      ts: 1_700_000_000_000 + i,
      agent: 'did:key:z6MkTest',
      decision: 'allow' as const,
      command: '/x/y',
      resource: { i },
      context: {},
    };
    const hash = sha256Hex(`${prevHash}|${canonicalize(payload as Record<string, unknown>)}`);
    events.push({
      event_id: eventId,
      customer_id: customerId,
      prev_hash: prevHash,
      hash,
      payload,
    });
    prevHash = hash;
  }
  return events;
}

function withSignedRoot(events: AuditBundleEvent[]): AuditBundle {
  const last = events.at(-1)!;
  const signature = bytesToHex(signDetached(kp.privateKey, new TextEncoder().encode(last.hash)));
  return {
    event_id: events[0]!.event_id,
    events,
    root: {
      root_event_id: last.event_id,
      root_hash: last.hash,
      signing_key_id: kp.did,
      signature,
      signed_at: '2026-05-09T00:00:00Z',
    },
  };
}

describe('verifyBundle', () => {
  it('accepts a valid signed bundle', () => {
    const bundle = withSignedRoot(buildChain({ count: 4 }));
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.signingKeyId).toBe(kp.did);
  });

  it('accepts an unsigned bundle (chain-only verification)', () => {
    const events = buildChain({ count: 3 });
    const bundle: AuditBundle = {
      event_id: events[0]!.event_id,
      events,
      root: null,
    };
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(true);
    expect(result.signedAt).toBeUndefined();
  });

  it('detects payload tampering (hash_mismatch)', () => {
    const bundle = withSignedRoot(buildChain({ count: 3 }));
    // Mutate event #1's payload — its stored hash no longer matches.
    (bundle.events[1]!.payload as { command: string }).command = '/EVIL';
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.reason).toBe('hash_mismatch');
    expect(result.errors[0]?.index).toBe(1);
  });

  it('detects spliced row (prev_hash_mismatch)', () => {
    const bundle = withSignedRoot(buildChain({ count: 3 }));
    // Rewrite event #1's prev_hash to ZERO_HASH — chain link broken.
    bundle.events[1] = { ...bundle.events[1]!, prev_hash: ZERO_HASH };
    // Recompute the hash so hash_mismatch doesn't fire too — only prev_hash_mismatch should.
    const ev = bundle.events[1]!;
    ev.payload = { ...ev.payload, prev_hash: ZERO_HASH };
    ev.hash = sha256Hex(
      `${ZERO_HASH}|${canonicalize(ev.payload as unknown as Record<string, unknown>)}`,
    );
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.reason === 'prev_hash_mismatch')).toBe(true);
  });

  it('rejects when root_hash is not in the chain', () => {
    const bundle = withSignedRoot(buildChain({ count: 3 }));
    bundle.root!.root_hash = 'a'.repeat(64);
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.reason === 'root_hash_not_found_in_chain')).toBe(true);
  });

  it('rejects when root_signature was signed by a different key', () => {
    const bundle = withSignedRoot(buildChain({ count: 2 }));
    const otherKp = generateKeypair();
    const otherKey = bytesToHex(otherKp.publicKey);
    const result = verifyBundle(bundle, otherKey);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.reason === 'root_signature_invalid')).toBe(true);
  });

  it('rejects when bundle.event_id does not equal events[0].event_id', () => {
    const events = buildChain({ count: 2 });
    const bundle: AuditBundle = {
      event_id: randomUUID(), // bogus
      events,
      root: null,
    };
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.reason).toBe('event_id_mismatch');
  });

  it('rejects an empty bundle', () => {
    const bundle: AuditBundle = { event_id: randomUUID(), events: [], root: null };
    const result = verifyBundle(bundle, verifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.reason).toBe('empty_bundle');
  });

  it('rejects when verifyKeyHex is unparseable', () => {
    const bundle = withSignedRoot(buildChain({ count: 2 }));
    const result = verifyBundle(bundle, 'not-hex');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.reason === 'root_signature_invalid')).toBe(true);
  });
});
