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
import {
  type CloudEnforcementOptions,
  checkCloudConnect,
  type DetectedConnector,
  detectCloudHost,
} from './cloud-host.js';
import { guardAndResolveHost, type HostGuardOptions } from './security/host-guard.js';

export interface EgressObservation {
  kind: 'connect' | 'http_request';
  /** Target host:port (CONNECT) or absolute URL (http_request). */
  target: string;
  method?: string;
  /** Request headers minus Proxy-* / Authorization (sanitized). */
  headers: Record<string, string>;
  /** Wall-clock timestamp. */
  ts: number;
  /** M11 — populated when the target hostname matches a cloud API host. */
  cloud?: { connector: DetectedConnector; service?: string; region?: string };
  /**
   * Sprint MAOS-A — W3C `traceparent` value when the agent emitted one.
   * Lets downstream correlation see "this egress was triggered by trace X
   * which was authorized by PDP receipt Y". Header itself is never
   * redacted (no secret), so passes through outbound unchanged.
   */
  traceparent?: string;
}

export type AuditFn = (obs: EgressObservation) => void;

export interface EgressProxyOptions {
  port: number;
  host?: string;
  audit: AuditFn;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
  /**
   * M11 — recognize cloud API hosts (Azure ARM, *.amazonaws.com,
   * *.googleapis.com). When `requireTokenForClouds` is set, CONNECTs
   * to those hosts must carry the PDP-issued proxy-authorization token
   * or are refused at the wire — defense-in-depth against a PDP bug.
   */
  cloud?: CloudEnforcementOptions;
  /**
   * Audit H6 — SSRF defence. When omitted, the proxy still resolves DNS and
   * blocks reserved/private/loopback/link-local/metadata addresses on every
   * CONNECT and plain HTTP forward. Operators can pass a suffix allowlist
   * (e.g. internal hostnames) or override the resolver in tests.
   */
  hostGuard?: HostGuardOptions;
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
    const traceparent = req.headers.traceparent;
    const obs: EgressObservation = {
      kind: 'http_request',
      target,
      method: req.method,
      headers: sanitize(req.headers),
      ts: Date.now(),
      ...(typeof traceparent === 'string' ? { traceparent } : {}),
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

    // Audit H6 — resolve + reject reserved IPs before forwarding. We connect
    // to the resolved literal so post-resolve DNS rebind cannot smuggle a
    // private address past us.
    guardAndResolveHost(url.hostname, opts.hostGuard)
      .then((verdict) => {
        if (!verdict.allow) {
          log.warn('egress denied (http)', {
            host: url.hostname,
            reason: verdict.reason,
            detail: verdict.detail,
          });
          res.writeHead(403, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: verdict.reason, detail: verdict.detail }));
          return;
        }
        const proxied = httpRequest(
          {
            host: verdict.resolvedHost,
            port: url.port || 80,
            method: req.method,
            path: url.pathname + url.search,
            headers: { ...req.headers, host: url.host },
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
      })
      .catch((err) => {
        log.warn('egress guard threw', err);
        res.writeHead(500);
        res.end();
      });
  });

  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const target = req.url ?? '';
    const [host, portStr] = target.split(':');
    const port = Number(portStr ?? '443');
    const cloudMatch = host ? detectCloudHost(host) : null;
    const traceparent = req.headers.traceparent;
    const obs: EgressObservation = {
      kind: 'connect',
      target,
      headers: sanitize(req.headers),
      ts: Date.now(),
      ...(cloudMatch ? { cloud: cloudMatch } : {}),
      ...(typeof traceparent === 'string' ? { traceparent } : {}),
    };
    try {
      opts.audit(obs);
    } catch (err) {
      log.warn('egress audit threw', err);
    }

    if (!host || !Number.isFinite(port)) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    // M11 — cloud egress enforcement.
    if (opts.cloud?.requireTokenForClouds) {
      const verdict = checkCloudConnect(
        host,
        req.headers['proxy-authorization'] as string | undefined,
        opts.cloud,
      );
      if (!verdict.allow) {
        log.warn('cloud egress denied', { host, reason: verdict.reason });
        clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
    }

    // Audit H6 — resolve + reject reserved IPs before tunnelling. Connect to
    // the resolved literal so post-resolve DNS rebind cannot relocate the
    // tunnel onto an internal address mid-flight.
    void guardAndResolveHost(host, opts.hostGuard).then((verdict) => {
      if (!verdict.allow) {
        log.warn('egress denied (connect)', {
          host,
          reason: verdict.reason,
          detail: verdict.detail,
        });
        clientSocket.end(`HTTP/1.1 403 Forbidden\r\nX-Egress-Deny: ${verdict.reason}\r\n\r\n`);
        return;
      }

      const upstream = netConnect(port, verdict.resolvedHost, () => {
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
