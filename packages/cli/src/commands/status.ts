interface ServiceStatus {
  name: string;
  url: string;
  ok: boolean;
  detail: string;
}

async function ping(name: string, url: string, signal: AbortSignal): Promise<ServiceStatus> {
  try {
    const res = await fetch(url, { signal });
    if (res.ok) return { name, url, ok: true, detail: `${res.status}` };
    return { name, url, ok: false, detail: `${res.status} ${res.statusText}` };
  } catch (err) {
    return { name, url, ok: false, detail: (err as Error).message };
  }
}

function parseFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function runStatus(args: string[]): Promise<void> {
  const cp = parseFlag(args, '--cp') ?? process.env.CB_CONTROL_PLANE_URL ?? 'http://localhost:8788';
  const pdp = parseFlag(args, '--pdp') ?? process.env.CB_PDP_URL ?? 'http://localhost:8787';
  const dash =
    parseFlag(args, '--dashboard') ?? process.env.CB_DASHBOARD_URL ?? 'http://localhost:3000';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  const results = await Promise.all([
    ping('control-plane', `${cp}/healthz`, ac.signal),
    ping('pdp', `${pdp}/healthz`, ac.signal),
    ping('dashboard', dash, ac.signal),
  ]);
  clearTimeout(timer);

  for (const r of results) {
    const tag = r.ok ? 'OK' : 'FAIL';
    console.info(`${r.name.padEnd(14)} ${tag.padEnd(4)} ${r.url}  (${r.detail})`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) process.exit(1);
}
