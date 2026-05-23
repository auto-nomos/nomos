import { PaneShell, PathTabs } from '../path-tabs';

export function StepConnect() {
  return (
    <section id="step-1" className="border-b border-aegis-line scroll-mt-24">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">step 01</div>
          <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper md:text-[56px]">
            Connect <em>an agent</em>.
          </h2>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-aegis-mute md:text-base">
            Every agent identifies itself to Nomos with an API key. CLI users export it once. MCP
            clients put it in their config. SDK users pass it to{' '}
            <code className="font-mono text-aegis-paper">createIntentClient()</code>. The key says{' '}
            <em>who</em> is asking — policy still decides every call.
          </p>
          <ul className="mt-7 space-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            <li>· Issued from /app/api-keys</li>
            <li>· Visible exactly once</li>
            <li>· Revocable per-key, per-app</li>
          </ul>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <PathTabs
            panes={{
              cli: (
                <PaneShell caption="install + verify connection">
                  {`npm i -g @auto-nomos/cli
export NOMOS_API_KEY=nk_live_…
cb status                       # control plane reachable
cb connect-agent cursor         # writes Cursor's mcp.json`}
                </PaneShell>
              ),
              mcp: (
                <PaneShell caption="~/.cursor/mcp.json  ·  Claude Desktop also accepts this shape">
                  {`{
  "mcpServers": {
    "nomos": {
      "command": "npx",
      "args": ["-y", "@auto-nomos/mcp-server@latest"],
      "env": {
        "NOMOS_API_KEY": "nk_live_…",
        "NOMOS_CONTROL_URL": "https://control.auto-nomos.com",
        "NOMOS_PDP_URL": "https://pdp.auto-nomos.com"
      }
    }
  }
}`}
                </PaneShell>
              ),
              sdk: (
                <PaneShell caption="agent.ts  ·  fail-closed by default">
                  {`import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: process.env.NOMOS_CONTROL_URL!,
  apiKey: process.env.NOMOS_API_KEY!,
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
