import { AlertTriangle } from 'lucide-react';

/**
 * Band 3 — The mistake. One idea: putting raw tokens in agent prompts is how
 * creds end up in screenshots. Single struck-through code block, one caption.
 */
export function Mistake() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28 md:px-10 md:py-32">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-aegis-coral" aria-hidden />
            the mistake
          </div>
          <h2 className="display mt-5 text-[36px] leading-[1.05] text-aegis-paper sm:text-[44px] md:text-[56px] md:leading-[1.02]">
            A token in a <em>prompt</em>
            <br />
            is a token in a screenshot.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            The default agent quickstart says: paste your OAuth token into the system message. It
            ends up in model traces, OTel spans, training caches, and the screenshot someone shares
            in Slack at 11pm.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-5 sm:p-8">
            <div className="eyebrow mb-5 text-aegis-coral">don&rsquo;t do this</div>
            <pre className="overflow-x-auto font-mono text-[12px] leading-[1.7] text-aegis-mute line-through decoration-aegis-coral/60 decoration-1 sm:text-[13px] sm:leading-[1.8]">
              {`const agent = createAgent({
  systemPrompt: \`
    You are a release bot. Use this GitHub token to ship code:
    ghp_W7Yk2pNvZxQ8mHb4cFrJdT9eAuLqB1sR0gXi
  \`,
});

await agent.run("ship v0.2.1");
// → token now in: model trace · langfuse span · cache · backup`}
            </pre>
            <div className="mt-6 flex items-start gap-3 border-t border-aegis-line pt-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-aegis-coral" aria-hidden />
              <p className="text-sm leading-relaxed text-aegis-paper">
                Once a credential is in the context window, you have lost control of where it goes
                next. Rotation is reactive. Audit is best-effort. Blast radius is the lifetime of
                the token times every place a trace might land.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
