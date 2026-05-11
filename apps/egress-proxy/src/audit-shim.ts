/**
 * Audit transport. Two backends:
 *   - http: POST batched observations to control-plane (production wiring)
 *   - stdout: pretty-print to stderr (dev fallback)
 *
 * Skeleton ships stdout only; HTTP wiring lands in M9 with the
 * onboarding wizard's "your first call" demo.
 */
import type { EgressObservation } from './proxy.js';

const TARGET_DOMAINS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'];

export type AuditSink = (obs: EgressObservation) => void;

export function createStdoutSink(): AuditSink {
  return (obs) => {
    const target = obs.target;
    const interesting = TARGET_DOMAINS.some((d) => target.includes(d));
    const tag = interesting ? '[LLM]' : '[OUT]';
    process.stderr.write(
      `${new Date(obs.ts).toISOString()} ${tag} ${obs.kind} ${obs.method ?? 'CONNECT'} ${target}\n`,
    );
  };
}

export interface HttpSinkOptions {
  controlPlaneUrl: string;
  serviceToken: string;
  customerId: string;
  flushIntervalMs?: number;
  fetch?: typeof fetch;
}

export function createHttpSink(opts: HttpSinkOptions): AuditSink {
  const f = opts.fetch ?? globalThis.fetch;
  const flushMs = opts.flushIntervalMs ?? 1_000;
  let buffer: EgressObservation[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
      await f(`${opts.controlPlaneUrl.replace(/\/+$/, '')}/v1/egress/observe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-token': opts.serviceToken,
        },
        body: JSON.stringify({ customerId: opts.customerId, observations: batch }),
      });
    } catch {
      // best-effort; observe-only — do not retry storm.
    }
  }

  return (obs) => {
    buffer.push(obs);
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushMs);
    }
  };
}
