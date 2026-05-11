/**
 * Minimal HTTP/HTTPS forwarding proxy (observe-only).
 *
 * - HTTP CONNECT requests are tunneled at the TCP layer (TLS preserved).
 * - Plain HTTP requests are forwarded with body unchanged.
 * - Each request is reported via auditFn(observation) before being passed
 *   through; auditFn is fire-and-forget (errors logged, never block).
 *
 * Body interception requires generating a local CA + signing per-host
 * certs at runtime. That's P2; the skeleton here logs hostname only.
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';

export interface EgressObservation {
  kind: 'connect' | 'http_request';
  /** Target host:port (CONNECT) or absolute URL (http_request). */
  target: string;
  method?: string;
  /** Request headers minus Proxy-* / Authorization (sanitized). */
  headers: Record<string, string>;
  /** Wall-clock timestamp. */
  ts: number;
}

export type AuditFn = (obs: EgressObservation) => void;

export interface EgressProxyOptions {
  port: number;
  host?: string;
  audit: AuditFn;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'anthropic-version',
]);

function sanitize(h: NodeJS.Dict<string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = k.toLowerCase();
    if (SENSITIVE_HEADERS.has(lk)) {
      out[lk] = '<redacted>';
      continue;
    }
    out[lk] = Array.isArray(v) ? v.join(',') : (v ?? '');
  }
  return out;
}

export function createEgressProxy(opts: EgressProxyOptions): {
  start(): Promise<void>;
  stop(): Promise<void>;
} {
  const log = opts.logger ?? { info: () => {}, warn: () => {} };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const target = req.url ?? '';
    const obs: EgressObservation = {
      kind: 'http_request',
      target,
      method: req.method,
      headers: sanitize(req.headers),
      ts: Date.now(),
    };
    try {
      opts.audit(obs);
    } catch (err) {
      log.warn('egress audit threw', err);
    }

    if (!target.startsWith('http')) {
      res.writeHead(400);
      res.end('absolute URL required (HTTP proxy mode)');
      return;
    }

    let url: URL;
    try {
      url = new URL(target);
    } catch {
      res.writeHead(400);
      res.end('invalid URL');
      return;
    }

    const proxied = httpRequest(
      {
        host: url.hostname,
        port: url.port || 80,
        method: req.method,
        path: url.pathname + url.search,
        headers: req.headers,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxied.on('error', (err) => {
      log.warn('upstream error', err);
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxied);
  });

  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const target = req.url ?? '';
    const obs: EgressObservation = {
      kind: 'connect',
      target,
      headers: sanitize(req.headers),
      ts: Date.now(),
    };
    try {
      opts.audit(obs);
    } catch (err) {
      log.warn('egress audit threw', err);
    }

    const [host, portStr] = target.split(':');
    const port = Number(portStr ?? '443');
    if (!host || !Number.isFinite(port)) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    const upstream = netConnect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    const cleanup = (): void => {
      try {
        upstream.destroy();
      } catch {
        /* ignore */
      }
      try {
        clientSocket.destroy();
      } catch {
        /* ignore */
      }
    };

    upstream.on('error', (err) => {
      log.warn('connect upstream error', err);
      cleanup();
    });
    clientSocket.on('error', (err) => {
      log.warn('connect client error', err);
      cleanup();
    });
  });

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve) => {
        server.listen(opts.port, opts.host ?? '127.0.0.1', () => {
          log.info(`egress proxy listening on ${opts.host ?? '127.0.0.1'}:${opts.port}`);
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
