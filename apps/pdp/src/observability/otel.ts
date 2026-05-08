import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

export interface OtelHandle {
  shutdown(): Promise<void>;
}

const NOOP: OtelHandle = { shutdown: async () => {} };

/**
 * Initialize the OpenTelemetry Node SDK with OTLP/HTTP exporters when an
 * endpoint is configured. Returns a no-op handle when not configured so the
 * PDP runs without observability dependencies in dev/test.
 */
export async function initOtel(config: Config, logger: Logger): Promise<OtelHandle> {
  if (!config.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info('OTEL_EXPORTER_OTLP_ENDPOINT not set; skipping OTel init');
    return NOOP;
  }

  // Dynamic imports keep the OTel deps off the import path when not configured.
  const [
    { NodeSDK },
    { resourceFromAttributes },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { ATTR_SERVICE_NAME },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/exporter-metrics-otlp-http'),
    import('@opentelemetry/sdk-metrics'),
    import('@opentelemetry/semantic-conventions'),
  ]);

  const headers = parseOtelHeaders(config.OTEL_EXPORTER_OTLP_HEADERS);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME }),
    traceExporter: new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      headers,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
        headers,
      }),
      exportIntervalMillis: 30_000,
    }),
  });

  sdk.start();
  logger.info({ endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT }, 'OTel SDK started');

  return {
    async shutdown() {
      await sdk.shutdown();
    },
  };
}

function parseOtelHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
