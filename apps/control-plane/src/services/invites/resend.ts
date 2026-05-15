import type { Logger } from '../../logger.js';
import { type InviteNotifier, loggerInviteNotifier } from './notify.js';

export interface ResendInviteNotifierOptions {
  /** RESEND_API_KEY. Empty/undefined → falls back to console logger. */
  apiKey: string | undefined;
  /** Verified sender, e.g. `Nomos <invites@auto-nomos.com>`. */
  from: string | undefined;
  /** Used to build the accept-invite link. */
  dashboardUrl: string;
  logger: Logger;
  fetch?: typeof fetch;
}

const RESEND_BASE = 'https://api.resend.com';

/**
 * Builds an InviteNotifier backed by Resend. Falls back to the logger notifier
 * when `apiKey` or `from` is missing — keeps dev / test environments working
 * without secrets.
 */
export function createResendInviteNotifier(opts: ResendInviteNotifierOptions): InviteNotifier {
  if (!opts.apiKey || !opts.from) {
    opts.logger.warn(
      'RESEND_API_KEY or RESEND_FROM unset — invite emails fall back to console logger',
    );
    return loggerInviteNotifier(opts.logger);
  }
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const apiKey = opts.apiKey;
  const from = opts.from;
  const baseUrl = opts.dashboardUrl.replace(/\/$/, '');

  return async (n) => {
    const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(n.token)}`;
    const inviterName = n.invitedBy.name ?? n.invitedBy.email;
    const subject = `${inviterName} invited you to ${n.orgName} on Nomos`;
    const expires = n.expiresAt.toUTCString();

    const html = renderHtml({
      orgName: n.orgName,
      role: n.role,
      inviterName,
      inviterEmail: n.invitedBy.email,
      acceptUrl,
      expires,
    });
    const text = renderText({
      orgName: n.orgName,
      role: n.role,
      inviterName,
      inviterEmail: n.invitedBy.email,
      acceptUrl,
      expires,
    });

    try {
      const res = await fetchFn(`${RESEND_BASE}/emails`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: [n.email],
          subject,
          html,
          text,
          reply_to: n.invitedBy.email,
          tags: [
            { name: 'kind', value: 'org_invite' },
            { name: 'role', value: n.role },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        opts.logger.warn({ status: res.status, body, email: n.email }, 'resend invite send failed');
        return;
      }
      opts.logger.info({ email: n.email, orgName: n.orgName, role: n.role }, 'invite email sent');
    } catch (err) {
      opts.logger.warn({ err, email: n.email }, 'resend invite errored');
    }
  };
}

interface RenderArgs {
  orgName: string;
  role: string;
  inviterName: string;
  inviterEmail: string;
  acceptUrl: string;
  expires: string;
}

function renderHtml(a: RenderArgs): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b0d10;margin:0;padding:32px;color:#e7ecf2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#11151a;border:1px solid #1f2730;border-radius:8px;overflow:hidden">
    <tr><td style="padding:28px 32px 8px">
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7b8794">Nomos</div>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#e7ecf2">You're invited to ${escapeHtml(a.orgName)}</h1>
    </td></tr>
    <tr><td style="padding:0 32px 12px">
      <p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#b6bfca">
        <strong style="color:#e7ecf2">${escapeHtml(a.inviterName)}</strong>
        <span style="color:#7b8794"> (${escapeHtml(a.inviterEmail)})</span>
        invited you to join <strong style="color:#e7ecf2">${escapeHtml(a.orgName)}</strong>
        as <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#1a212a;color:#9ad0ff;padding:2px 6px;border-radius:3px;font-size:12px">${escapeHtml(a.role)}</code>.
      </p>
    </td></tr>
    <tr><td style="padding:18px 32px 8px">
      <a href="${a.acceptUrl}" style="display:inline-block;background:#9ad0ff;color:#0b0d10;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600;font-size:14px">Accept invite</a>
    </td></tr>
    <tr><td style="padding:6px 32px 24px">
      <p style="margin:14px 0 0;font-size:12px;color:#7b8794">
        Or copy this link:<br>
        <a href="${a.acceptUrl}" style="color:#9ad0ff;word-break:break-all">${a.acceptUrl}</a>
      </p>
      <p style="margin:18px 0 0;font-size:11px;color:#5a6470">
        Link expires ${escapeHtml(a.expires)}. If you weren't expecting this, you can ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(a: RenderArgs): string {
  return [
    `${a.inviterName} (${a.inviterEmail}) invited you to ${a.orgName} on Nomos.`,
    `Role: ${a.role}`,
    '',
    `Accept the invite:`,
    a.acceptUrl,
    '',
    `Expires ${a.expires}.`,
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
