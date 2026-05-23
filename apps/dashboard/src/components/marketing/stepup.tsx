import { Fingerprint, ShieldCheck } from 'lucide-react';

/**
 * Band 7 — Step-up passkey. One idea: the human stays in the loop for the
 * dangerous stuff. Mock of the approval flow + the envelope-scope payoff.
 */
export function Stepup() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-aegis-signal" aria-hidden />
            step-up approval
          </div>
          <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
            For the calls
            <br />
            that <em>matter</em>.
          </h2>
          <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
            Detect a high-impact action at policy time, push to your device, wait for a passkey
            signature, then mint a cosigner UCAN. One tap covers an envelope of actions — the next
            ten calls in the same intent silent-mint until the envelope expires.
          </p>
          <ul className="mt-8 space-y-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute">
            <li className="flex items-center gap-3">
              <span className="h-1 w-3 bg-aegis-signal" />
              repo transfers · prod deletes · refunds
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1 w-3 bg-aegis-amber" />
              new resource · novel scope · denied retry
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1 w-3 bg-aegis-coral" />
              anything you flag in Cedar
            </li>
          </ul>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-8">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow">approval · pending</div>
              <span className="font-mono text-[10px] text-aegis-faint">expires in 02:14</span>
            </div>
            <div className="mt-6 rounded-sm border border-aegis-line bg-aegis-surface/50 p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-aegis-amber/40 bg-aegis-amber/10">
                  <ShieldCheck className="h-5 w-5 text-aegis-amber" aria-hidden />
                </div>
                <div>
                  <div className="font-display text-[20px] text-aegis-paper">
                    release-bot wants to transfer a repo
                  </div>
                  <p className="mt-2 text-sm text-aegis-mute">
                    Command{' '}
                    <code className="font-mono text-[12px] text-aegis-paper">
                      github.transfer_repo
                    </code>{' '}
                    on{' '}
                    <code className="font-mono text-[12px] text-aegis-paper">
                      varendra007/nomos
                    </code>
                    . Once approved, this envelope covers the next 3 actions in the same intent.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink"
                  disabled
                >
                  <Fingerprint className="h-4 w-4" />
                  Approve with passkey
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute"
                  disabled
                >
                  Deny
                </button>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-px border-t border-aegis-line bg-aegis-line pt-px font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
              <div className="bg-aegis-ink px-4 py-4">
                <div className="text-aegis-mute">envelope</div>
                <div className="mt-1.5 text-aegis-paper">3 actions</div>
              </div>
              <div className="bg-aegis-ink px-4 py-4">
                <div className="text-aegis-mute">cosigner ttl</div>
                <div className="mt-1.5 text-aegis-paper">120s</div>
              </div>
              <div className="bg-aegis-ink px-4 py-4">
                <div className="text-aegis-mute">audit</div>
                <div className="mt-1.5 text-aegis-signal">recorded</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
