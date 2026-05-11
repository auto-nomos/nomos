import { stdin, stdout } from 'node:process';

/**
 * Minimal terminal UI for cb. Three panes — Status, Approvals, Audit —
 * with tab/Q-to-quit navigation. Status pings real /healthz endpoints;
 * Approvals + Audit currently render placeholders (require API-key
 * auth wiring landing in M9). Upgrade path: replace render() with
 * an ink/react App once SSE endpoints exist on control-plane.
 *
 * Keep this dependency-free so `cb tui` works on any Node 22+ install.
 */
const CP_URL = () => process.env.CB_CONTROL_PLANE_URL ?? 'http://localhost:8788';
const PDP_URL = () => process.env.CB_PDP_URL ?? 'http://localhost:8787';
const DASH_URL = () => process.env.CB_DASHBOARD_URL ?? 'http://localhost:3000';

type Pane = 'status' | 'approvals' | 'audit';

interface State {
  pane: Pane;
  status: { cp: string; pdp: string; dash: string } | null;
  refreshing: boolean;
  lastError: string | null;
}

const PANES: Pane[] = ['status', 'approvals', 'audit'];

function clear(): void {
  stdout.write('\x1b[2J\x1b[H');
}

function color(s: string, code: string): string {
  return `\x1b[${code}m${s}\x1b[0m`;
}

function paneHeader(state: State): string {
  return PANES.map((p) => (p === state.pane ? color(` ${p.toUpperCase()} `, '7') : ` ${p} `)).join(
    ' ',
  );
}

function renderStatus(state: State): string {
  if (!state.status) return '  (loading…)';
  const fmt = (label: string, val: string) =>
    `  ${label.padEnd(14)} ${val.startsWith('OK') ? color(val, '32') : color(val, '31')}`;
  return [
    fmt('control-plane', state.status.cp),
    fmt('pdp', state.status.pdp),
    fmt('dashboard', state.status.dash),
  ].join('\n');
}

function renderApprovals(): string {
  return `  Pending step-up approvals will appear here once API-key auth is
  wired (M9 onboarding). For now, approvals show in the dashboard at
  ${DASH_URL()}/audit and via the Telegram bot (M6).`;
}

function renderAudit(): string {
  return `  Live audit feed will stream here once control-plane exposes an
  SSE endpoint (post-M7). For now, browse at ${DASH_URL()}/audit.`;
}

function render(state: State): void {
  clear();
  stdout.write(color('cb tui', '1') + '   ');
  stdout.write(paneHeader(state) + '\n');
  stdout.write(color('  press: ', '2'));
  stdout.write(color('tab', '1'));
  stdout.write(' switch  ');
  stdout.write(color('r', '1'));
  stdout.write(' refresh  ');
  stdout.write(color('q', '1'));
  stdout.write(' quit\n\n');

  let body: string;
  switch (state.pane) {
    case 'status':
      body = renderStatus(state);
      break;
    case 'approvals':
      body = renderApprovals();
      break;
    case 'audit':
      body = renderAudit();
      break;
  }
  stdout.write(body + '\n\n');

  if (state.refreshing) stdout.write(color('  (refreshing…)\n', '2'));
  if (state.lastError) stdout.write(color(`  error: ${state.lastError}\n`, '31'));
}

async function refreshStatus(state: State): Promise<void> {
  state.refreshing = true;
  state.lastError = null;
  render(state);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  try {
    const ping = async (url: string): Promise<string> => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        return res.ok ? `OK (${res.status})` : `FAIL (${res.status})`;
      } catch (err) {
        return `FAIL (${(err as Error).message})`;
      }
    };
    const [cp, pdp, dash] = await Promise.all([
      ping(`${CP_URL()}/healthz`),
      ping(`${PDP_URL()}/healthz`),
      ping(DASH_URL()),
    ]);
    state.status = { cp, pdp, dash };
  } catch (err) {
    state.lastError = (err as Error).message;
  } finally {
    clearTimeout(timer);
    state.refreshing = false;
    render(state);
  }
}

export async function runTui(_args: string[]): Promise<void> {
  if (!stdin.isTTY) {
    console.info('cb tui: requires a TTY. (Pipe a TTY in, or use --status alternatives.)');
    return;
  }

  const state: State = {
    pane: 'status',
    status: null,
    refreshing: false,
    lastError: null,
  };

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  void refreshStatus(state);

  const onData = (chunk: string): void => {
    for (const ch of chunk) {
      if (ch === 'q' || ch === '\x03') {
        clear();
        stdin.setRawMode(false);
        stdin.pause();
        process.exit(0);
      }
      if (ch === '\t') {
        const idx = PANES.indexOf(state.pane);
        state.pane = PANES[(idx + 1) % PANES.length]!;
        render(state);
      }
      if (ch === 'r') {
        if (state.pane === 'status') void refreshStatus(state);
        else render(state);
      }
    }
  };

  stdin.on('data', onData);

  // Block forever; exit handler is in onData.
  await new Promise(() => {});
}
