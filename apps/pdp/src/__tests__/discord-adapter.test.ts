import type { DiscordConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateDiscordProxyCall } from '../adapters/discord.js';

describe('validateDiscordProxyCall', () => {
  const guildConstraint: DiscordConstraint = {
    provider: 'discord',
    guild_id: 'G_PRIMARY',
  };

  it('allows in-scope channel list of the pinned guild', () => {
    expect(
      validateDiscordProxyCall(guildConstraint, {
        method: 'GET',
        path: '/guilds/G_PRIMARY/channels',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects channel create on a different guild', () => {
    expect(
      validateDiscordProxyCall(guildConstraint, {
        method: 'POST',
        path: '/guilds/G_OTHER/channels',
        body: { name: 'sneaky', type: 0 },
      }),
    ).toEqual({ ok: false, reason: 'guild_mismatch' });
  });

  it('channel-pinned constraint rejects post to a different channel', () => {
    const cc: DiscordConstraint = { provider: 'discord', channel_id: 'C1' };
    expect(
      validateDiscordProxyCall(cc, {
        method: 'POST',
        path: '/channels/C1/messages',
        body: { content: 'hi' },
      }),
    ).toEqual({ ok: true });
    expect(
      validateDiscordProxyCall(cc, {
        method: 'POST',
        path: '/channels/C2/messages',
        body: { content: 'wrong' },
      }),
    ).toEqual({ ok: false, reason: 'channel_mismatch' });
  });

  it('message-pinned constraint rejects deleting a different message', () => {
    const mc: DiscordConstraint = {
      provider: 'discord',
      channel_id: 'C1',
      message_id: 'M1',
    };
    expect(
      validateDiscordProxyCall(mc, {
        method: 'DELETE',
        path: '/channels/C1/messages/M2',
      }),
    ).toEqual({ ok: false, reason: 'message_mismatch' });
  });

  it('role-pinned constraint scopes role mutation to one role', () => {
    const rc: DiscordConstraint = {
      provider: 'discord',
      guild_id: 'G1',
      role_id: 'R1',
    };
    expect(
      validateDiscordProxyCall(rc, {
        method: 'PATCH',
        path: '/guilds/G1/roles/R1',
        body: { name: 'renamed' },
      }),
    ).toEqual({ ok: true });
    expect(
      validateDiscordProxyCall(rc, {
        method: 'DELETE',
        path: '/guilds/G1/roles/R2',
      }),
    ).toEqual({ ok: false, reason: 'role_mismatch' });
  });

  it('user-pinned constraint rejects member-role mutation for another user', () => {
    const uc: DiscordConstraint = {
      provider: 'discord',
      guild_id: 'G1',
      user_id: 'U1',
    };
    expect(
      validateDiscordProxyCall(uc, {
        method: 'PUT',
        path: '/guilds/G1/members/U1/roles/R5',
      }),
    ).toEqual({ ok: true });
    expect(
      validateDiscordProxyCall(uc, {
        method: 'PUT',
        path: '/guilds/G1/members/U2/roles/R5',
      }),
    ).toEqual({ ok: false, reason: 'user_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateDiscordProxyCall(guildConstraint, {
        method: 'GET',
        path: '/users/@me',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });

  it('open guild constraint (no field set) permits everything parseable', () => {
    const open: DiscordConstraint = { provider: 'discord' };
    expect(
      validateDiscordProxyCall(open, {
        method: 'POST',
        path: '/guilds/anything/channels',
        body: { name: 'x', type: 0 },
      }),
    ).toEqual({ ok: true });
  });
});
