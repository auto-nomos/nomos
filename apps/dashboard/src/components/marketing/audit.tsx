import { Hash } from 'lucide-react';

/**
 * Band 6 — Live audit. One idea: hash-chained, Ed25519-signed, replayable
 * forever. ASCII hash-chain visual + one sentence about offline verify.
 */
export function Audit() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow flex items-center gap-3">
              <Hash className="h-4 w-4 text-aegis-signal" aria-hidden />
              live audit
            </div>
            <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
              Every decision,
              <br />
              <em>signed</em> and chained.
            </h2>
            <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
              Each PDP decision is hashed against the previous one. A daily root signs the whole
              window with our Ed25519 key. Hand any signed root to our CLI and walk the chain back
              to genesis. Forever. Offline.
            </p>
            <pre className="mt-8 overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink p-5 font-mono text-[12px] text-aegis-signal">
              {`$ npx @auto-nomos/audit-verify \\
    --bundle audit-2026-05-23.tar.gz
  ✓ 14,922 events verified
  ✓ root signature valid (kid 0x4d2c)
  ✓ chain head: 09f4·1c7b·ae71`}
            </pre>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-8">
              <div className="eyebrow mb-6">chain · last 3 events</div>
              <pre className="overflow-x-auto font-mono text-[12px] leading-[1.9] text-aegis-paper">
                {`event N-1                      hash 09f4ab21…
├─ ts        14:22:06.182 UTC
├─ agent     fin-bot
├─ command   stripe.refund_charge
├─ decision  deny · policy: refund_above_threshold
└─ prev      e7c0…
                              │
                              ▼
event N                        hash 1c7b9d04…
├─ ts        14:22:07.001 UTC
├─ agent     support-bot
├─ command   slack.post_message
├─ decision  allow
└─ prev      09f4ab21…
                              │
                              ▼
event N+1                      hash ae7142f9…
├─ ts        14:22:08.214 UTC
├─ agent     release-bot
├─ command   github.transfer_repo
├─ decision  step-up · passkey required
└─ prev      1c7b9d04…

─────────────────────────────────────────────
daily root  2026-05-23  sig 7f3a…  kid 0x4d2c`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
