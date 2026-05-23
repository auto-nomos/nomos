import { PaneShell, PathTabs } from '../path-tabs';

export function StepApp() {
  return (
    <section id="step-2" className="border-b border-aegis-line bg-aegis-surface/20 scroll-mt-24">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">step 02</div>
          <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper md:text-[56px]">
            Create <em>an App</em>.
          </h2>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-aegis-mute md:text-base">
            An App is one agent's identity inside your org. It carries a DID for signing UCANs, a
            default policy, and its own API keys. The name shows up in every audit row forever —
            name it accurately.
          </p>
          <ul className="mt-7 space-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            <li>· One DID per agent</li>
            <li>· Mode: dynamic or static</li>
            <li>· Rotate keys without breaking the App</li>
          </ul>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <PathTabs
            panes={{
              cli: (
                <PaneShell caption="create app + issue key (key printed once)">
                  {`cb apps create \\
  --name "Inbox triage bot" \\
  --mode dynamic
# → app_01J7K…

cb apps keys create app_01J7K…
# → NEW KEY: nk_live_…  (visible once)`}
                </PaneShell>
              ),
              mcp: (
                <PaneShell caption="prompt your agent — same mutation as the dashboard">
                  {`> Create a Nomos app called "Inbox triage bot"
> in dynamic mode, then issue an API key
> and print it.

The MCP server exposes apps.create and
apps.keys.create. The agent reads back the
key value, which you store wherever you
keep secrets.`}
                </PaneShell>
              ),
              sdk: (
                <PaneShell caption="creates an App + an API key in one block">
                  {`const app = await client.apps.create({
  name: 'Inbox triage bot',
  mode: 'dynamic',
});

const key = await client.apps.keys.create({
  appId: app.id,
});
// store key.value — only returned once`}
                </PaneShell>
              ),
              py: (
                <PaneShell caption="same mutation, AuthGuard's control-plane client">
                  {`app = guard.apps.create(
    name="Inbox triage bot",
    mode="dynamic",
)

key = guard.apps.keys.create(app_id=app.id)
# store key.value — only returned once`}
                </PaneShell>
              ),
            }}
          />
        </div>
      </div>
    </section>
  );
}
