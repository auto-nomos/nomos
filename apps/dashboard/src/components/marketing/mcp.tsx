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
      <div className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow flex items-center gap-3">
              <Boxes className="h-4 w-4 text-aegis-signal" aria-hidden />
              mcp-native
            </div>
            <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
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
              <div className="border-b border-aegis-line px-7 py-5">
                <div className="eyebrow">supported clients</div>
              </div>
              <ul className="divide-y divide-aegis-line">
                {CLIENTS.map((c) => (
                  <li
                    key={c.name}
                    className="grid grid-cols-12 items-center gap-4 px-7 py-5 transition-colors hover:bg-aegis-surface/40"
                  >
                    <div className="col-span-5 font-display text-[22px] text-aegis-paper">
                      {c.name}
                    </div>
                    <div className="col-span-5 font-mono text-[11px] text-aegis-mute">
                      <code className="break-all">{c.config}</code>
                    </div>
                    <div className="col-span-2 text-right">
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
