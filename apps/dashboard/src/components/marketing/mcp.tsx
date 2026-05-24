import { Boxes } from 'lucide-react';

/**
 * Band 8 — MCP-native. One idea: npx @auto-nomos/mcp-server — works in
 * Claude / Cursor / Claude Code / Windsurf today.
 */
const CLIENTS: { name: string; config: string; status: 'shipped' | 'beta' }[] = [
  {
    name: 'Claude Desktop',
    config: '~/Library/Application Support/Claude/claude_desktop_config.json',
    status: 'shipped',
  },
  { name: 'Cursor', config: '~/.cursor/mcp.json', status: 'shipped' },
  { name: 'Claude Code', config: 'claude mcp add nomos', status: 'shipped' },
  { name: 'Windsurf', config: '~/.codeium/windsurf/mcp_config.json', status: 'beta' },
];

export function Mcp() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28 md:px-10 md:py-32">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow flex items-center gap-3">
              <Boxes className="h-4 w-4 text-aegis-signal" aria-hidden />
              mcp-native
            </div>
            <h2 className="display mt-5 text-[36px] leading-[1.05] text-aegis-paper sm:text-[44px] md:text-[56px] md:leading-[1.02]">
              One <em>npx</em>.
              <br />
              In your editor.
            </h2>
            <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
              Nomos ships as an MCP server. Point Claude Desktop, Cursor, or Claude Code at it and
              every tool call your agent makes — across all 24 integrations — is gated, proxied, and
              chained. No code in your editor.
            </p>
            <pre className="mt-8 overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink p-5 font-mono text-[12px] text-aegis-signal">
              {`$ npx -y @auto-nomos/mcp-server \\
    --config ./nomos.json
  ✓ connected to PDP
  ✓ 24 integrations available
  → ready for tool calls`}
            </pre>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink">
              <div className="border-b border-aegis-line px-5 py-5 sm:px-7">
                <div className="eyebrow">supported clients</div>
              </div>
              <ul className="divide-y divide-aegis-line">
                {CLIENTS.map((c) => (
                  <li
                    key={c.name}
                    className="grid grid-cols-12 items-center gap-3 px-5 py-4 transition-colors hover:bg-aegis-surface/40 sm:gap-4 sm:px-7 sm:py-5"
                  >
                    <div className="col-span-12 font-display text-[18px] text-aegis-paper sm:col-span-5 sm:text-[22px]">
                      {c.name}
                    </div>
                    <div className="col-span-9 font-mono text-[11px] text-aegis-mute sm:col-span-5">
                      <code className="break-all">{c.config}</code>
                    </div>
                    <div className="col-span-3 text-right sm:col-span-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                          c.status === 'shipped'
                            ? 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal'
                            : 'border-aegis-amber/40 bg-aegis-amber/10 text-aegis-amber'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
