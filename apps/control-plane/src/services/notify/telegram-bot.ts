/**
 * M6 — Telegram approval bot.
 *
 * - Long-polls Telegram /getUpdates so it works behind NAT (no public webhook).
 * - On `/start <link-token>`: redeems token, links chat_id ↔ customer_id.
 * - On callback_query `approve:<id>` / `deny:<id>`: resolves the
 *   push_approval row.
 * - sendStepUp(): posts an inline-keyboard message to a linked chat.
 *
 * Soft-approval policy: a Telegram inline tap sets state='approved' but
 * does NOT mint a cosigner UCAN. The PDP independently enforces the
 * cosigner-required gate on a per-policy basis: high-sensitivity actions
 * keep requiring a passkey via the dashboard PWA. Low/medium-sensitivity
 * actions can pass with Telegram-only approval. Audit captures channel.
 */

import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import {
  agents as agentsTable,
  customerTelegramLinks,
  pushApprovals,
  telegramLinkTokens,
} from '../../db/schema.js';
import type { Logger } from '../../logger.js';
import { upsertGrant } from '../grants/upsert.js';
import type { PolicyInvalidator } from '../policy-invalidator.js';

interface TgChat {
  id: number;
  username?: string;
  first_name?: string;
}

interface TgMessage {
  chat: TgChat;
  text?: string;
  message_id?: number;
}

interface TgCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message: { chat: TgChat; message_id: number };
  data: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TelegramBotOptions {
  token: string;
  username: string;
  pollTimeoutS: number;
  db: DrizzleClient;
  logger: Logger;
  fetch?: typeof fetch;
  /** Fires after telegram "always" tap writes a grant so PDP cache
   *  refreshes within ~250ms instead of waiting for the periodic timer. */
  policyInvalidator?: PolicyInvalidator;
}

export interface SendStepUpArgs {
  chatId: string;
  approvalId: string;
  command: string;
  resource: Record<string, unknown>;
  deepLink: string;
  ttlSeconds: number;
  riskScore?: 'low' | 'medium' | 'high' | null;
  riskSummary?: string | null;
  /** LLM-recommended scope hint for the operator (narrow/medium/broad).
   *  Telegram message embeds it; the actual 3-variant picker lives on the
   *  dashboard approve page. */
  recommendedScope?: 'narrow' | 'medium' | 'broad' | null;
}

export interface MintTokenArgs {
  customerId: string;
  userId: string;
  ttlSeconds?: number;
}

export interface MintedToken {
  token: string;
  deepLink: string;
  expiresAt: Date;
}

export interface TelegramBot {
  start(): void;
  stop(): void;
  sendStepUp(args: SendStepUpArgs): Promise<boolean>;
  mintLinkToken(args: MintTokenArgs): Promise<MintedToken>;
  /** Send a plain-text Markdown message to every enabled Telegram link for a customer. */
  sendToCustomer(customerId: string, text: string): Promise<void>;
}

export function createTelegramBot(opts: TelegramBotOptions): TelegramBot {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const apiBase = `https://api.telegram.org/bot${opts.token}`;
  let lastUpdateId = 0;
  let stopped = false;

  async function call<T = unknown>(method: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`${apiBase}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      throw new Error(`telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`);
    }
    return json.result as T;
  }

  async function sendMessage(args: {
    chatId: string | number;
    text: string;
    replyMarkup?: unknown;
    parseMode?: string;
  }): Promise<void> {
    await call('sendMessage', {
      chat_id: args.chatId,
      text: args.text,
      parse_mode: args.parseMode ?? 'Markdown',
      reply_markup: args.replyMarkup,
      disable_web_page_preview: true,
    });
  }

  async function answer(queryId: string, text?: string): Promise<void> {
    try {
      await call('answerCallbackQuery', { callback_query_id: queryId, text });
    } catch (err) {
      opts.logger.warn({ err }, 'telegram-bot: answerCallbackQuery failed');
    }
  }

  async function editText(args: {
    chatId: number | string;
    messageId: number;
    text: string;
  }): Promise<void> {
    try {
      await call('editMessageText', {
        chat_id: args.chatId,
        message_id: args.messageId,
        text: args.text,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      opts.logger.warn({ err }, 'telegram-bot: editMessageText failed');
    }
  }

  async function consumeStartToken(
    token: string,
    chatId: string,
    username: string | undefined,
  ): Promise<{ customerId: string; userId: string } | null> {
    const now = new Date();
    return await opts.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(telegramLinkTokens)
        .where(eq(telegramLinkTokens.token, token))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      if (row.consumedAt) return null;
      if (row.expiresAt <= now) return null;
      await tx
        .update(telegramLinkTokens)
        .set({ consumedAt: now })
        .where(eq(telegramLinkTokens.token, token));
      await tx
        .insert(customerTelegramLinks)
        .values({
          customerId: row.customerId,
          userId: row.userId,
          chatId,
          username: username ?? null,
          enabled: true,
          lastUsedAt: now,
        })
        .onConflictDoUpdate({
          target: [customerTelegramLinks.customerId, customerTelegramLinks.chatId],
          set: { username: username ?? null, lastUsedAt: now, enabled: true },
        });
      return { customerId: row.customerId, userId: row.userId };
    });
  }

  async function handleStart(chat: TgChat, payload: string): Promise<void> {
    const link = await consumeStartToken(payload, String(chat.id), chat.username);
    if (!link) {
      await sendMessage({
        chatId: chat.id,
        text: 'This link is invalid, expired, or already used. Generate a new one in the dashboard.',
      });
      return;
    }
    await sendMessage({
      chatId: chat.id,
      text: '✓ Linked. Approval prompts will arrive here. /unlink to disconnect.',
    });
  }

  async function handleUnlink(chat: TgChat): Promise<void> {
    await opts.db
      .update(customerTelegramLinks)
      .set({ enabled: false })
      .where(eq(customerTelegramLinks.chatId, String(chat.id)));
    await sendMessage({
      chatId: chat.id,
      text: 'Unlinked. No more approval prompts here.',
    });
  }

  async function resolveApproval(
    approvalId: string,
    state: 'approved' | 'denied',
  ): Promise<boolean> {
    const now = new Date();
    const updated = await opts.db
      .update(pushApprovals)
      .set({ state, decidedAt: now })
      .where(and(eq(pushApprovals.id, approvalId), eq(pushApprovals.state, 'pending')))
      .returning({ id: pushApprovals.id });
    return updated.length > 0;
  }

  /**
   * Write an allow/deny grant for the approval's (agent, command, resource).
   *
   * Telegram taps don't carry a Better-Auth user session, so `grantedBy` is
   * left null until we wire telegram-user-to-user-id resolution. The grant
   * still takes effect through the Cedar bundle pipeline.
   */
  async function persistGrantFromTelegram(
    approvalId: string,
    decision: 'allow' | 'deny',
  ): Promise<void> {
    const [row] = await opts.db
      .select({
        customerId: pushApprovals.customerId,
        agentId: pushApprovals.agentId,
        agentName: agentsTable.name,
        command: pushApprovals.command,
        resource: pushApprovals.resource,
        riskSummary: pushApprovals.riskSummary,
      })
      .from(pushApprovals)
      .leftJoin(agentsTable, eq(pushApprovals.agentId, agentsTable.id))
      .where(eq(pushApprovals.id, approvalId))
      .limit(1);
    if (!row || !row.agentName) return;
    try {
      await upsertGrant(opts.db, {
        customerId: row.customerId,
        agentId: row.agentId,
        agentName: row.agentName,
        command: row.command,
        resource: row.resource as Record<string, unknown>,
        scope: 'any',
        decision,
        grantedBy: row.customerId,
        sourceApprovalId: approvalId,
        riskSummary: row.riskSummary,
      });
      opts.policyInvalidator?.invalidate(row.customerId);
    } catch (err) {
      opts.logger.warn({ err, approvalId, decision }, 'telegram-bot: upsertGrant failed');
    }
  }

  async function handleCallback(q: TgCallbackQuery): Promise<void> {
    const m = q.data.match(
      /^(approve_once|approve_always|deny_once|deny_always|approve|deny):(.+)$/,
    );
    if (!m) {
      await answer(q.id, 'Unknown action');
      return;
    }
    const [, rawAction, approvalId] = m as [string, string, string];
    const action =
      rawAction === 'approve' ? 'approve_once' : rawAction === 'deny' ? 'deny_once' : rawAction;
    const isApprove = action === 'approve_once' || action === 'approve_always';
    const isAlways = action === 'approve_always' || action === 'deny_always';
    const ok = await resolveApproval(approvalId, isApprove ? 'approved' : 'denied');
    if (!ok) {
      await answer(q.id, 'Already decided or expired.');
      await editText({
        chatId: q.message.chat.id,
        messageId: q.message.message_id,
        text: '_Step-up no longer pending._',
      });
      return;
    }
    if (isAlways) {
      await persistGrantFromTelegram(approvalId, isApprove ? 'allow' : 'deny');
    }
    const verb = isApprove
      ? isAlways
        ? '✓ Approved (remembered)'
        : '✓ Approved'
      : isAlways
        ? '✗ Denied (remembered)'
        : '✗ Denied';
    await answer(q.id, verb);
    await editText({
      chatId: q.message.chat.id,
      messageId: q.message.message_id,
      text: `${verb} via Telegram (user ${q.from.id})`,
    });
  }

  async function processUpdate(u: TgUpdate): Promise<void> {
    try {
      if (u.message?.text && u.message.chat) {
        const text = u.message.text;
        const chat = u.message.chat;
        const startMatch = text.match(/^\/start\s+(\S+)/);
        if (startMatch) return await handleStart(chat, startMatch[1]!);
        if (text === '/unlink') return await handleUnlink(chat);
        if (text === '/start' || text === '/help') {
          await sendMessage({
            chatId: chat.id,
            text:
              `Your Telegram chat ID is: \`${chat.id}\`\n\n` +
              `To receive step-up approval alerts:\n` +
              `1. Open the Nomos dashboard\n` +
              `2. Go to Settings → Notifications\n` +
              `3. Check *Telegram*, paste \`${chat.id}\` in the Chat ID field, and save.\n\n` +
              `Use /unlink to stop notifications.`,
          });
          return;
        }
        return;
      }
      if (u.callback_query) {
        await handleCallback(u.callback_query);
      }
    } catch (err) {
      opts.logger.warn({ err }, 'telegram-bot: error processing update');
    }
  }

  async function pollLoop(): Promise<void> {
    while (!stopped) {
      try {
        const updates = await call<TgUpdate[]>('getUpdates', {
          offset: lastUpdateId + 1,
          timeout: opts.pollTimeoutS,
        });
        for (const u of updates) {
          if (u.update_id > lastUpdateId) lastUpdateId = u.update_id;
          await processUpdate(u);
        }
      } catch (err) {
        opts.logger.warn({ err }, 'telegram-bot: poll error; backing off 5s');
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  function start(): void {
    opts.logger.info({ username: opts.username }, 'telegram bot starting (long-poll)');
    void pollLoop();
  }

  function stop(): void {
    stopped = true;
  }

  async function sendStepUp(args: SendStepUpArgs): Promise<boolean> {
    try {
      const resourceJson = JSON.stringify(args.resource).slice(0, 200);
      const riskBadge = args.riskScore
        ? args.riskScore === 'high'
          ? '🔴 *High risk*'
          : args.riskScore === 'medium'
            ? '🟡 *Medium risk*'
            : '🟢 *Low risk*'
        : '';
      const summaryLine = args.riskSummary ? `_${args.riskSummary}_` : '';
      const scopeHint = args.recommendedScope
        ? `_Suggested scope: *${args.recommendedScope}* — pick on dashboard_`
        : '';
      const text = [
        '*Step-up requested*',
        ...(riskBadge ? [riskBadge] : []),
        ...(summaryLine ? [summaryLine] : []),
        '',
        `*Action:* \`${args.command}\``,
        `*Expires in:* ${args.ttlSeconds}s`,
        '',
        `Resource: \`${resourceJson}\``,
        ...(scopeHint ? ['', scopeHint] : []),
        '',
        '_Once = this call only · Always = remember decision_',
      ].join('\n');
      await sendMessage({
        chatId: args.chatId,
        text,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '✓ Allow once', callback_data: `approve_once:${args.approvalId}` },
              { text: '✓ Always allow', callback_data: `approve_always:${args.approvalId}` },
            ],
            [
              { text: '✗ Deny once', callback_data: `deny_once:${args.approvalId}` },
              { text: '✗ Always deny', callback_data: `deny_always:${args.approvalId}` },
            ],
            [{ text: 'Open in browser', url: args.deepLink }],
          ],
        },
      });
      return true;
    } catch (err) {
      opts.logger.warn({ err, approvalId: args.approvalId }, 'telegram-bot: sendStepUp failed');
      return false;
    }
  }

  async function mintLinkToken(args: MintTokenArgs): Promise<MintedToken> {
    const token = randomBytes(16).toString('base64url');
    const ttl = args.ttlSeconds ?? 600;
    const expiresAt = new Date(Date.now() + ttl * 1_000);
    await opts.db.insert(telegramLinkTokens).values({
      token,
      customerId: args.customerId,
      userId: args.userId,
      expiresAt,
    });
    const deepLink = `https://t.me/${opts.username}?start=${token}`;
    return { token, deepLink, expiresAt };
  }

  async function sendToCustomer(customerId: string, text: string): Promise<void> {
    const links = await opts.db
      .select({ chatId: customerTelegramLinks.chatId })
      .from(customerTelegramLinks)
      .where(
        and(
          eq(customerTelegramLinks.customerId, customerId),
          eq(customerTelegramLinks.enabled, true),
        ),
      );
    await Promise.all(
      links.map((l) =>
        sendMessage({ chatId: l.chatId, text }).catch((err) => {
          opts.logger.warn({ err, customerId }, 'telegram-bot: sendToCustomer failed for chat');
        }),
      ),
    );
  }

  return { start, stop, sendStepUp, mintLinkToken, sendToCustomer };
}
