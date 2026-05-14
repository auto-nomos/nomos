/**
 * Swarm orchestrator + agent service (Path B).
 *
 * Single binary, two modes selected by NOMOS_ROLE:
 *   - "orchestrator" — serves an HTML control panel on :3100, mints the
 *     planner's root UCAN via /v1/mint-ucan, fires the chain by hitting
 *     agent-planner on :3101.
 *   - "agent"        — generic per-agent service. POST /run propagates
 *     the chain through HTTP body to the next role and back. Three
 *     instances run in compose: agent-planner / agent-researcher / agent-writer.
 *
 * Wire format between services (HTTP body, NOT env, because cross-container):
 *   { task, parentChain, parentReceiptId?, swarmId? }
 *
 * Authorize against the host CP+PDP (via NOMOS_CP_URL / NOMOS_PDP_URL).
 * Deterministic — no LLM dependency. If ANTHROPIC_API_KEY is set the agent
 * still doesn't call out (LLM hook is a TODO marker).
 */

import { createAuthGuard, forkChildViaCp } from '@auto-nomos/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const ROLE = process.env.NOMOS_ROLE ?? 'orchestrator';
const PORT = Number(process.env.PORT ?? '3100');
const CP = process.env.NOMOS_CP_URL ?? 'http://host.docker.internal:8788';
const PDP = process.env.NOMOS_PDP_URL ?? 'http://host.docker.internal:8787';

interface RunBody {
  task: string;
  parentChain?: string[];
  parentReceiptId?: string;
  swarmId?: string;
}

interface RunResult {
  role: string;
  decision: { allow: boolean; reason: string; receiptId?: string; chainDepth?: number };
  upstreamStatus?: number;
  childResult?: RunResult;
}

if (ROLE === 'orchestrator') {
  const app = orchestratorApp();
  serve({ fetch: app.fetch, port: PORT });
  console.info(`[swarm:orchestrator] http://0.0.0.0:${PORT}`);
} else {
  const app = agentApp();
  serve({ fetch: app.fetch, port: PORT });
  console.info(`[swarm:agent role=${ROLE}] http://0.0.0.0:${PORT}`);
}

// ────────────── orchestrator (root agent + control panel) ──────────────

function orchestratorApp(): Hono {
  const app = new Hono();
  const apiKey = process.env.NOMOS_PLANNER_API_KEY ?? '';
  const oauthConn = process.env.NOMOS_OAUTH_CONNECTION_ID ?? '';
  const swarmId = process.env.NOMOS_SWARM_ID ?? '';
  const owner = process.env.NOMOS_GITHUB_OWNER ?? 'octocat';
  const repo = process.env.NOMOS_GITHUB_REPO ?? 'hello-world';

  const recent: { ts: number; line: string }[] = [];
  const log = (line: string): void => {
    recent.push({ ts: Date.now(), line });
    if (recent.length > 200) recent.shift();
    console.info(line);
  };

  app.get('/', (c) => c.html(controlPanelHtml({ swarmId, owner, repo })));
  app.get('/api/log', (c) => c.json({ events: recent }));

  app.post('/api/run', async (c) => {
    if (!apiKey) return c.json({ error: 'NOMOS_PLANNER_API_KEY unset' }, 500);
    log('▶ orchestrator: minting planner root UCAN…');

    const guard = createAuthGuard({ pdpUrl: PDP, controlPlaneUrl: CP, apiKey });
    const ucans = await guard.mintUcan({
      commands: ['/github/issue/list'],
      oauthConnectionId: oauthConn || undefined,
    });
    const root = ucans.get('/github/issue/list');
    if (!root) return c.json({ error: 'planner mint failed' }, 500);
    log('✓ planner UCAN minted');

    // Authorize from planner once, then fork into researcher.
    const proxy = await guard.proxy({
      ucan: root.jwt,
      command: '/github/issue/list',
      swarm_id: swarmId,
      apiCall: { method: 'GET', path: `/repos/${owner}/${repo}/issues`, query: { per_page: '1' } },
    });
    log(
      `✓ planner depth=0 decision=${proxy.decision.allow ? 'allow' : 'deny'} status=${proxy.upstream?.status ?? '-'}`,
    );
    if (!proxy.decision.allow) return c.json({ error: 'planner denied', decision: proxy.decision });

    const researcherAgentId = process.env.NOMOS_RESEARCHER_AGENT_ID ?? '';
    if (!researcherAgentId) return c.json({ error: 'NOMOS_RESEARCHER_AGENT_ID unset' }, 500);
    const fork = await forkChildViaCp({
      controlPlaneUrl: CP,
      apiKey,
      parentChain: [root.jwt],
      childAgentId: researcherAgentId,
      command: '/github/issue/list',
      ttlSeconds: 300,
      parentReceiptId: proxy.decision.receiptId ?? '',
      swarmId,
      oauthConnectionId: oauthConn || undefined,
    });
    log(`✓ forked researcher chain.depth=${fork.chain.length}`);

    const next = await postRun('http://agent-researcher:3101/run', {
      task: 'list issues',
      parentChain: fork.chain,
      parentReceiptId: proxy.decision.receiptId,
      swarmId,
    });
    log(`✓ researcher returned: ${JSON.stringify(next.decision)}`);
    return c.json({ planner: proxy.decision, downstream: next });
  });

  return app;
}

// ────────────── agent (per-role HTTP service) ──────────────

function agentApp(): Hono {
  const app = new Hono();
  const apiKey = process.env.NOMOS_API_KEY ?? '';
  const owner = process.env.NOMOS_GITHUB_OWNER ?? 'octocat';
  const repo = process.env.NOMOS_GITHUB_REPO ?? 'hello-world';
  const oauthConn = process.env.NOMOS_OAUTH_CONNECTION_ID ?? '';
  const childUrl = process.env.NOMOS_CHILD_URL; // unset for leaf
  const childAgentId = process.env.NOMOS_CHILD_AGENT_ID; // unset for leaf

  app.get('/', (c) => c.json({ role: ROLE, ok: true }));

  app.post('/run', async (c) => {
    const body = (await c.req.json()) as RunBody;
    if (!apiKey) return c.json({ error: 'NOMOS_API_KEY unset' }, 500);
    const parent = body.parentChain ?? [];
    console.info(`[${ROLE}] /run depth=${parent.length} task="${body.task}"`);

    const guard = createAuthGuard({ pdpUrl: PDP, controlPlaneUrl: CP, apiKey });
    const ucans = await guard.mintUcan({
      commands: ['/github/issue/list'],
      oauthConnectionId: oauthConn || undefined,
    });
    const root = ucans.get('/github/issue/list');
    if (!root) return c.json({ error: 'mint failed' }, 500);

    // Stitch our leaf onto the parent chain.
    const chain = [...parent, root.jwt];
    const proxy = await guard.proxy({
      ucan: root.jwt,
      command: '/github/issue/list',
      delegated_chain: chain,
      ...(body.parentReceiptId ? { parent_receipt_id: body.parentReceiptId } : {}),
      ...(body.swarmId ? { swarm_id: body.swarmId } : {}),
      apiCall: { method: 'GET', path: `/repos/${owner}/${repo}/issues`, query: { per_page: '1' } },
    });

    const result: RunResult = {
      role: ROLE,
      decision: {
        allow: proxy.decision.allow,
        reason: proxy.decision.reason ?? 'allow',
        ...(proxy.decision.receiptId ? { receiptId: proxy.decision.receiptId } : {}),
        ...(proxy.decision.chain_depth !== undefined
          ? { chainDepth: proxy.decision.chain_depth }
          : {}),
      },
      ...(proxy.upstream ? { upstreamStatus: proxy.upstream.status } : {}),
    };

    if (childUrl && childAgentId && proxy.decision.allow) {
      const fork = await forkChildViaCp({
        controlPlaneUrl: CP,
        apiKey,
        parentChain: chain,
        childAgentId,
        command: '/github/issue/list',
        ttlSeconds: 180,
        parentReceiptId: proxy.decision.receiptId ?? '',
        ...(body.swarmId ? { swarmId: body.swarmId } : {}),
        oauthConnectionId: oauthConn || undefined,
      });
      const downstream = await postRun(childUrl, {
        task: body.task,
        parentChain: fork.chain,
        parentReceiptId: proxy.decision.receiptId,
        ...(body.swarmId ? { swarmId: body.swarmId } : {}),
      });
      result.childResult = downstream;
    }

    return c.json(result);
  });

  return app;
}

async function postRun(url: string, body: RunBody): Promise<RunResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`postRun ${url} ${res.status}: ${txt}`);
  }
  return (await res.json()) as RunResult;
}

// ────────────── HTML control panel ──────────────

function controlPanelHtml(opts: { swarmId: string; owner: string; repo: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Nomos swarm — Path B</title>
    <style>
      :root { color-scheme: dark; }
      body { font: 14px/1.5 ui-monospace, monospace; background: #0a0a0a; color: #e5e5e5; padding: 24px; max-width: 900px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .sub { color: #888; margin-bottom: 24px; }
      button { background: #2dd4bf; color: #0a0a0a; border: 0; padding: 10px 16px; font: inherit; font-weight: 600; border-radius: 4px; cursor: pointer; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      pre { background: #141414; border: 1px solid #2a2a2a; padding: 12px; border-radius: 4px; overflow-x: auto; max-height: 60vh; }
      .row { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
      .pill { background: #1f1f1f; border: 1px solid #333; padding: 2px 8px; border-radius: 3px; font-size: 11px; color: #9ca3af; }
      .ok { color: #34d399; } .err { color: #f87171; }
    </style>
  </head>
  <body>
    <h1>Nomos swarm — Path B</h1>
    <p class="sub">3-deep delegation chain (planner → researcher → writer) running across 3 docker services. Chain propagates over HTTP between services; PDP enforces on every hop.</p>
    <div class="row">
      <span class="pill">swarm ${opts.swarmId.slice(0, 8) || '???'}</span>
      <span class="pill">github://${opts.owner}/${opts.repo}</span>
    </div>
    <div class="row">
      <button id="run">▶ Run swarm</button>
      <a class="pill" href="https://www.auto-nomos.com/app/swarms/${opts.swarmId}" target="_blank">↗ open swarm view</a>
    </div>
    <h3>Live log</h3>
    <pre id="log">(idle)</pre>
    <script>
      const out = document.getElementById('log');
      const btn = document.getElementById('run');
      let timer;
      async function poll() {
        const res = await fetch('/api/log');
        const data = await res.json();
        out.textContent = data.events.map((e) => new Date(e.ts).toISOString().slice(11, 19) + '  ' + e.line).join('\\n') || '(idle)';
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = 'kicking off…';
        timer = setInterval(poll, 500);
        try {
          const r = await fetch('/api/run', { method: 'POST' });
          const data = await r.json();
          await poll();
          out.textContent += '\\n\\n=== final ===\\n' + JSON.stringify(data, null, 2);
        } catch (e) {
          out.textContent += '\\n\\n!! ' + e.message;
        } finally {
          clearInterval(timer);
          btn.disabled = false;
        }
      });
      poll();
    </script>
  </body>
</html>`;
}
