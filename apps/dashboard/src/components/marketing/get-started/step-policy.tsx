import { PaneShell, PathTabs } from '../path-tabs';

export function StepPolicy() {
  return (
    <section id="step-3" className="border-b border-aegis-line scroll-mt-24">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">step 03</div>
          <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper md:text-[56px]">
            Attach <em>a policy</em>.
          </h2>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-aegis-mute md:text-base">
            Without a policy, every authorize denies — fail-closed by design. The fastest path: the
            starter template <code className="font-mono text-aegis-paper">github:read-only</code>.
            Edit it later or build your own in the visual policy builder.
          </p>
          <div className="mt-7 rounded-sm border border-aegis-line bg-aegis-ink p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
              cedar · template github:read-only
            </div>
            <pre className="overflow-x-auto font-mono text-[12px] leading-[1.65] text-aegis-paper">
              {`permit (
  principal,
  action == Action::"github:issue:list",
  resource is GithubRepo
)
when { principal.app == resource.allowed_app };`}
            </pre>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <PathTabs
            panes={{
              cli: (
                <PaneShell caption="instantiate template + attach to app">
                  {`cb policies create \\
  --from-template github:read-only \\
  --name "GitHub read"
# → pol_01J7K…

cb apps policy attach \\
  --app app_01J7K… \\
  --policy pol_01J7K…`}
                </PaneShell>
              ),
              mcp: (
                <PaneShell caption="prompt — server fulfills policies.createFromTemplate + apps.attachPolicy">
                  {`> Attach the github:read-only template to my
> "Inbox triage bot" app.

The MCP server calls the same control-plane
endpoints the CLI uses. No code on your side.`}
                </PaneShell>
              ),
              sdk: (
                <PaneShell caption="two calls — policy from template, then attach">
                  {`const policy = await client.policies
  .createFromTemplate({
    template: 'github:read-only',
    name: 'GitHub read',
  });

await client.apps.attachPolicy({
  appId: app.id,
  policyId: policy.id,
});`}
                </PaneShell>
              ),
            }}
          />
        </div>
      </div>
    </section>
  );
}
