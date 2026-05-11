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
import { customerTelegramLinks, pushApprovals, telegramLinkTokens } from '../../db/schema.js';
import type { Logger } from '../../logger.js';

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
}

export interface SendStepUpArgs {
  chatId: string;
  approvalId: string;
  command: string;
  resource: Record<string, unknown>;
  deepLink: string;
  ttlSeconds: number;
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

  async function handleCallback(q: TgCallbackQuery): Promise<void> {
    const m = q.data.match(/^(approve|deny):(.+)$/);
    if (!m) {
      await answer(q.id, 'Unknown action');
      return;
    }
    const [, action, approvalId] = m as [string, 'approve' | 'deny', string];
    const ok = await resolveApproval(approvalId, action === 'approve' ? 'approved' : 'denied');
    if (!ok) {
      await answer(q.id, 'Already decided or expired.');
      await editText({
        chatId: q.message.chat.id,
        messageId: q.message.message_id,
        text: '_Step-up no longer pending._',
      });
      return;
    }
    const verb = action === 'approve' ? '✓ Approved' : '✗ Denied';
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
            text: 'credential-broker bot. Open the dashboard → Settings → Connect Telegram to link.',
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
      const text = [
        '*Step-up requested*',
        '',
        `*Action:* \`${args.command}\``,
        `*Expires in:* ${args.ttlSeconds}s`,
        '',
        `Resource: \`${resourceJson}\``,
      ].join('\n');
      await sendMessage({
        chatId: args.chatId,
        text,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '✓ Approve', callback_data: `approve:${args.approvalId}` },
              { text: '✗ Deny', callback_data: `deny:${args.approvalId}` },
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

  return { start, stop, sendStepUp, mintLinkToken };
}
