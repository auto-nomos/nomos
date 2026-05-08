import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('cb-pdp');

export const authorizeTotal = meter.createCounter('authorize_total', {
  description: 'Total authorize calls, labeled by decision',
});

export function recordAuthorize(decision: 'allow' | 'deny' | 'stepup', reason?: string): void {
  authorizeTotal.add(1, reason ? { decision, reason } : { decision });
}
