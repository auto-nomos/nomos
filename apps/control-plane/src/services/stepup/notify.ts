import type { Logger } from '../../logger.js';
import type { TelegramBot } from '../notify/telegram-bot.js';

export interface NotificationChannelPrefs {
  telegramChatId?: string | null;
  telegramEnabled?: boolean;
  emailEnabled?: boolean;
  webPushEnabled?: boolean;
}

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
  riskScore?: 'low' | 'medium' | 'high' | null;
  riskSummary?: string | null;
  /** LLM-recommended scope for the human to start with (narrow/medium/broad). */
  recommendedScope?: 'narrow' | 'medium' | 'broad' | null;
  /** Resolved per-user preferences. Knock workflow branches on these
   *  data fields; no client-side branching here. */
  prefs?: NotificationChannelPrefs;
}

export interface StepUpNotifierOptions {
  /** KNOCK_API_KEY. Empty/undefined = dev console fallback. */
  apiKey?: string | undefined;
  /** Knock workflow id. Defaults to `step-up-request`. */
  workflow?: string;
  logger: Logger;
  fetch?: typeof fetch;
  /**
   * M6 — when set, fan out to Telegram directly (bypassing Knock) when
   * prefs.telegramChatId is non-null and prefs.telegramEnabled is true.
   */
  telegramBot?: TelegramBot;
}

export type StepUpNotifier = (args: StepUpNotifyArgs) => Promise<void>;

const KNOCK_BASE = 'https://api.knock.app/v1';

export function createStepUpNotifier(opts: StepUpNotifierOptions): StepUpNotifier {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const workflow = opts.workflow ?? 'step-up-request';

  return async (args: StepUpNotifyArgs) => {
    const prefs = args.prefs ?? {};

    // M6 — direct Telegram path: short-circuit Knock when bot configured.
    if (
      opts.telegramBot &&
      prefs.telegramEnabled !== false &&
      prefs.telegramChatId &&
      prefs.telegramChatId.length > 0
    ) {
      const sent = await opts.telegramBot.sendStepUp({
        chatId: prefs.telegramChatId,
        approvalId: args.approvalId,
        command: args.command,
        resource: args.resource,
        deepLink: args.deepLink,
        ttlSeconds: args.ttlSeconds ?? 60,
        ...(args.riskScore !== undefined ? { riskScore: args.riskScore } : {}),
        ...(args.riskSummary !== undefined ? { riskSummary: args.riskSummary } : {}),
        ...(args.recommendedScope !== undefined ? { recommendedScope: args.recommendedScope } : {}),
      });
      if (sent) return;
      opts.logger.warn(
        { approvalId: args.approvalId },
        'telegram send failed; falling back to Knock / dev console',
      );
    }

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
        // Channel routing flags consumed by the Knock workflow.
        // The workflow branches: web push + email default on,
        // Telegram only fires when telegram_chat_id is non-null and
        // telegram_enabled = true.
        telegram_chat_id:
          prefs.telegramEnabled && prefs.telegramChatId ? prefs.telegramChatId : null,
        email_enabled: prefs.emailEnabled !== false,
        web_push_enabled: prefs.webPushEnabled !== false,
        risk_score: args.riskScore ?? null,
        risk_summary: args.riskSummary ?? null,
        recommended_scope: args.recommendedScope ?? null,
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
