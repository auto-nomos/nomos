/**
 * Band 5 — Per-call decision. One idea: 12 lines of code, sub-50ms, fail-closed.
 * Single code block using the real createAuthGuard surface from the TS SDK.
 */
export function Decision() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">per-call decision</div>
          <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
            One <em>guard()</em>.
            <br />
            Every tool call.
          </h2>
          <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
            Drop the SDK into your agent. Every external call routes through one function. Allow,
            deny, or step-up in under fifty milliseconds — and fail-closed by default if the PDP is
            unreachable, so a network blip never opens the gate.
          </p>
          <ul className="mt-8 space-y-3 border-t border-aegis-line pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute">
            <li className="flex items-center justify-between">
              <span>language</span>
              <span className="text-aegis-paper">TypeScript · Python</span>
            </li>
            <li className="flex items-center justify-between">
              <span>p99 decision</span>
              <span className="text-aegis-signal">&lt;50ms</span>
            </li>
            <li className="flex items-center justify-between">
              <span>default on outage</span>
              <span className="text-aegis-coral">deny</span>
            </li>
          </ul>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-8">
            <div className="eyebrow mb-5">apps/agent/src/release-bot.ts</div>
            <pre className="overflow-x-auto font-mono text-[13px] leading-[1.85] text-aegis-paper">
              {`import { createAuthGuard } from '@auto-nomos/sdk';

const guard = createAuthGuard({
  apiKey: process.env.NOMOS_API_KEY!,
  agent: 'release-bot',
});

const decision = await guard.authorize({
  command: 'github.create_pr',
  resource: 'varendra007/nomos',
  payload: { title, body, head, base },
});

if (decision.decision !== 'allow') throw decision;
await guard.exec(decision);   // proxied, audited, signed`}
            </pre>
            <div className="mt-6 grid grid-cols-3 divide-x divide-aegis-line border-t border-aegis-line pt-5 font-mono text-[11px] text-aegis-faint">
              <div className="pr-4">
                <div className="text-aegis-signal">allow</div>
                <div className="mt-1 text-aegis-mute">proxy + audit</div>
              </div>
              <div className="px-4">
                <div className="text-aegis-amber">step-up</div>
                <div className="mt-1 text-aegis-mute">passkey, then retry</div>
              </div>
              <div className="pl-4">
                <div className="text-aegis-coral">deny</div>
                <div className="mt-1 text-aegis-mute">reason + receipt-id</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
