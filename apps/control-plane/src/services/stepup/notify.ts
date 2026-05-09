import type { Logger } from '../../logger.js';

export interface StepUpNotifyArgs {
  approvalId: string;
  customerId: string;
  agentId: string;
  /** Better-Auth user id who must approve. */
  decidingUserId: string;
  command: string;
  resource: Record<string, unknown>;
  deepLink: string;
  ttlSeconds?: number;
}

export interface StepUpNotifierOptions {
  /** KNOCK_API_KEY. Empty/undefined = dev console fallback. */
  apiKey?: string | undefined;
  /** Knock workflow id. Defaults to `step-up-request`. */
  workflow?: string;
  logger: Logger;
  fetch?: typeof fetch;
}

export type StepUpNotifier = (args: StepUpNotifyArgs) => Promise<void>;

const KNOCK_BASE = 'https://api.knock.app/v1';

export function createStepUpNotifier(opts: StepUpNotifierOptions): StepUpNotifier {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const workflow = opts.workflow ?? 'step-up-request';

  return async (args: StepUpNotifyArgs) => {
    if (!opts.apiKey || opts.apiKey.length === 0) {
      opts.logger.info(
        {
          devFallback: true,
          approvalId: args.approvalId,
          command: args.command,
          resource: args.resource,
          deepLink: args.deepLink,
        },
        'STEP-UP DEV CONSOLE — open deepLink manually to approve',
      );
      return;
    }

    const body = JSON.stringify({
      recipients: [args.decidingUserId],
      data: {
        approvalId: args.approvalId,
        customerId: args.customerId,
        agentId: args.agentId,
        command: args.command,
        resource: args.resource,
        deepLink: args.deepLink,
        ttlSeconds: args.ttlSeconds ?? 60,
      },
    });

    try {
      const res = await fetchFn(`${KNOCK_BASE}/workflows/${workflow}/trigger`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body,
      });
      if (!res.ok) {
        opts.logger.warn(
          { status: res.status, approvalId: args.approvalId },
          'knock push failed — user can still approve via deep link',
        );
      }
    } catch (err) {
      opts.logger.warn(
        { err, approvalId: args.approvalId },
        'knock push errored — user can still approve via deep link',
      );
    }
  };
}
