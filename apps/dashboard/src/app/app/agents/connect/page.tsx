'use client';

import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';

const CONTROL_PLANE_URL =
  process.env.NEXT_PUBLIC_CONTROL_PLANE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ??
  'http://localhost:8788';
const PDP_URL = process.env.NEXT_PUBLIC_PDP_URL ?? 'http://localhost:8787';

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

interface ClientSpec {
  id: string;
  label: string;
  badge?: string;
  blurb: string;
  steps: { title: string; body?: string; code?: string }[];
  configHint?: string;
}

export default function ConnectAgentPage() {
  const cp = CONTROL_PLANE_URL;
  const pdp = PDP_URL;

  const clients: ClientSpec[] = useMemo(() => {
    const claudeCodeSkill = `curl -sf "${cp}/skill/nomos-setup.md" \\
  --create-dirs -o ~/.claude/commands/nomos-setup.md`;
    const cliInstall = 'npm i -g @auto-nomos/cli';
    const _claudeCodeConnect = `nomos connect-agent claude-code \\
  --api-key <YOUR_API_KEY> \\
  --cp ${cp} \\
  --pdp ${pdp}`;
    const claudeDesktopMcp = JSON.stringify(
      {
        mcpServers: {
          nomos: {
            command: 'npx',
            args: ['-y', '@auto-nomos/mcp-server'],
            env: {
              CB_CONTROL_PLANE_URL: cp,
              CB_PDP_URL: pdp,
              CB_API_KEY: '<YOUR_API_KEY>',
            },
          },
        },
      },
      null,
      2,
    );
    const cursorMcp = claudeDesktopMcp;
    const codexToml = `[mcp_servers.nomos]
command = "npx"
args = ["-y", "@auto-nomos/mcp-server"]

[mcp_servers.nomos.env]
CB_CONTROL_PLANE_URL = "${cp}"
CB_PDP_URL = "${pdp}"
CB_API_KEY = "<YOUR_API_KEY>"`;
    const customJson = JSON.stringify(
      {
        controlPlaneUrl: cp,
        pdpUrl: pdp,
        apiKey: '<YOUR_API_KEY>',
        mcpEndpoint: `${cp}/mcp`,
      },
      null,
      2,
    );

    return [
      {
        id: 'claude-code',
        label: 'Claude Code',
        blurb: 'One slash-command install. Claude Code walks you through the rest interactively.',
        steps: [
          {
            title: 'Install the Nomos setup slash command',
            body: 'Run this in your terminal. It pulls the latest setup skill into Claude Code.',
            code: claudeCodeSkill,
          },
          {
            title: 'Run /nomos-setup in Claude Code',
            body: 'Open Claude Code and type `/nomos-setup`. Claude will install the CLI, ask for your API key, write the MCP config, and run a smoke test.',
          },
          {
            title: 'Approve the connection',
            body: 'The dashboard surfaces the first connection in Pending connections (below). One click and Claude Code can act.',
          },
        ],
      },
      {
        id: 'claude-desktop',
        label: 'Claude Desktop',
        blurb: 'Patch your Claude Desktop config to run the Nomos MCP server on launch.',
        steps: [
          { title: 'Install the CLI', code: cliInstall },
          {
            title: 'Patch the desktop config',
            body: 'CLI writes the snippet below into `claude_desktop_config.json` automatically.',
            code: `nomos connect-agent claude-desktop --api-key <YOUR_API_KEY> --cp ${cp} --pdp ${pdp}`,
          },
          {
            title: 'Or paste manually',
            body: 'macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`. Windows: `%APPDATA%/Claude/claude_desktop_config.json`.',
            code: claudeDesktopMcp,
          },
          {
            title: 'Restart Claude Desktop',
            body: 'The Nomos MCP server shows up in the tools list after restart.',
          },
        ],
      },
      {
        id: 'cursor',
        label: 'Cursor',
        blurb: 'Cursor reads from `~/.cursor/mcp.json`. We patch it for you.',
        steps: [
          { title: 'Install the CLI', code: cliInstall },
          {
            title: 'Run connect-agent',
            code: `nomos connect-agent cursor --api-key <YOUR_API_KEY> --cp ${cp} --pdp ${pdp}`,
          },
          {
            title: 'Or paste this into `~/.cursor/mcp.json`',
            code: cursorMcp,
          },
          { title: 'Restart Cursor.' },
        ],
      },
      {
        id: 'codex',
        label: 'Codex',
        badge: 'CLI',
        blurb: "OpenAI's Codex CLI uses TOML config at `~/.codex/config.toml`.",
        steps: [
          { title: 'Install the CLI', code: cliInstall },
          {
            title: 'Patch the codex TOML',
            code: `nomos connect-agent codex --api-key <YOUR_API_KEY> --cp ${cp} --pdp ${pdp}`,
          },
          {
            title: 'Or paste this block manually',
            code: codexToml,
          },
        ],
      },
      {
        id: 'other',
        label: 'Other / Custom',
        blurb:
          'Anything that speaks HTTP. Pass these values into your agent client (env, config, headers).',
        steps: [
          { title: 'Install the CLI', code: cliInstall },
          {
            title: 'Generate a generic bundle',
            body: 'Writes `.cb-mcp.json` + README into the target directory.',
            code: `nomos connect-agent custom --api-key <YOUR_API_KEY> --cp ${cp} --pdp ${pdp} --out ./nomos`,
          },
          {
            title: 'Or hand-wire these values',
            code: customJson,
          },
        ],
      },
    ];
  }, []);

  const [activeId, setActiveId] = useState(clients[0]?.id ?? 'claude-code');
  const _active = clients.find((c) => c.id === activeId) ?? clients[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connect an agent</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Pair an AI agent (Claude Code, Claude Desktop, Cursor, Codex, or any HTTP client) with
          Nomos so it can act on your SaaS — without ever holding the underlying credentials.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick your agent</CardTitle>
          <CardDescription>
            Each option ends the same way: a per-app API key + the Nomos MCP server on the client's
            machine. Approvals flow back to this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeId} onValueChange={setActiveId} className="space-y-6">
            <TabsList className="w-full justify-start overflow-x-auto">
              {clients.map((c) => (
                <TabsTrigger key={c.id} value={c.id} className="gap-2">
                  {c.label}
                  {c.badge ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {c.badge}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>

            {clients.map((c) => (
              <TabsContent key={c.id} value={c.id} className="space-y-5">
                <p className="max-w-2xl text-sm text-muted-foreground">{c.blurb}</p>
                <ol className="space-y-5">
                  {c.steps.map((s, i) => (
                    <li key={s.title} className="flex gap-4">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="flex-1 space-y-2">
                        <div className="text-sm font-medium text-foreground">{s.title}</div>
                        {s.body ? <p className="text-sm text-muted-foreground">{s.body}</p> : null}
                        {s.code ? <CodeBlock>{s.code}</CodeBlock> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it flows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-mono text-foreground">1.</span> Your agent calls a SaaS action via
            the Nomos MCP server, passing its API key. Nomos issues a short-lived UCAN.
          </p>
          <p>
            <span className="font-mono text-foreground">2.</span> First call from an unbound key
            lands in <strong>Pending connections</strong>. You approve once.
          </p>
          <p>
            <span className="font-mono text-foreground">3.</span> Every subsequent call is gated by
            Cedar policy + UCAN scope. Step-up actions ping you on passkey / Telegram / dashboard
            before they fire.
          </p>
          <p>
            <span className="font-mono text-foreground">4.</span> Every decision lands in the
            hash-chained audit log at <code className="text-foreground">/app/audit</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
