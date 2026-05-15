import type { Role } from '@auto-nomos/rbac';
import type { Logger } from '../../logger.js';

/** Payload handed to whoever ships the actual email. */
export interface InviteNotification {
  email: string;
  /** Org display name (already de-customer-ified for end-user surface). */
  orgName: string;
  role: Role;
  /** Raw (un-hashed) acceptance token — paste into the link. */
  token: string;
  expiresAt: Date;
  /** Who invited them; useful for the email subject line. */
  invitedBy: { email: string; name: string | null };
}

export type InviteNotifier = (n: InviteNotification) => Promise<void>;

/**
 * Dev-friendly fallback: log a structured line containing the raw token so
 * an engineer can copy-paste the accept link without an email provider.
 * Mirrors the recovery-OTP fallback in auth/index.ts.
 */
export function loggerInviteNotifier(logger: Logger): InviteNotifier {
  return async (n) => {
    logger.info(
      {
        devFallback: true,
        event: 'invites.send',
        email: n.email,
        orgName: n.orgName,
        role: n.role,
        token: n.token,
        expiresAt: n.expiresAt.toISOString(),
        invitedBy: n.invitedBy.email,
      },
      'ORG INVITE DEV CONSOLE — open the accept-invite link with this token',
    );
  };
}
