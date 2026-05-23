import { describe, expect, it } from 'vitest';
import { extractResourceFromApiCall } from '../extract.js';
import { parseDiscordPath } from '../path.js';

describe('parseDiscordPath', () => {
  it('parses /guilds/{guild_id}', () => {
    expect(parseDiscordPath('/guilds/G1')).toEqual({ guild_id: 'G1' });
  });

  it('parses /guilds/{guild_id}/channels', () => {
    expect(parseDiscordPath('/guilds/G1/channels')).toEqual({ guild_id: 'G1' });
  });

  it('parses /guilds/{guild_id}/members/{user_id}', () => {
    expect(parseDiscordPath('/guilds/G1/members/U2')).toEqual({ guild_id: 'G1', user_id: 'U2' });
  });

  it('parses /guilds/{guild_id}/members/{user_id}/roles/{role_id}', () => {
    expect(parseDiscordPath('/guilds/G1/members/U2/roles/R3')).toEqual({
      guild_id: 'G1',
      user_id: 'U2',
      role_id: 'R3',
    });
  });

  it('parses /guilds/{guild_id}/roles and /guilds/{guild_id}/roles/{role_id}', () => {
    expect(parseDiscordPath('/guilds/G1/roles')).toEqual({ guild_id: 'G1' });
    expect(parseDiscordPath('/guilds/G1/roles/R5')).toEqual({ guild_id: 'G1', role_id: 'R5' });
  });

  it('parses /channels/{channel_id}', () => {
    expect(parseDiscordPath('/channels/C1')).toEqual({ channel_id: 'C1' });
  });

  it('parses /channels/{channel_id}/messages/{message_id}', () => {
    expect(parseDiscordPath('/channels/C1/messages/M9')).toEqual({
      channel_id: 'C1',
      message_id: 'M9',
    });
  });

  it('parses /channels/{channel_id}/permissions/{overwrite_id}', () => {
    expect(parseDiscordPath('/channels/C1/permissions/O7')).toEqual({
      channel_id: 'C1',
      overwrite_id: 'O7',
    });
  });

  it('returns null for unknown shapes', () => {
    expect(parseDiscordPath('/users/@me')).toBeNull();
    expect(parseDiscordPath('no-leading-slash')).toBeNull();
    expect(parseDiscordPath('/')).toBeNull();
  });
});

describe('extractResourceFromApiCall (discord)', () => {
  const call = (path: string) => ({ method: 'GET', path });

  it('surfaces guild_id from /guilds/{guild_id}/channels', () => {
    expect(
      extractResourceFromApiCall('/discord/channel/list', call('/guilds/G1/channels')),
    ).toEqual({ guild_id: 'G1' });
  });

  it('surfaces channel_id + message_id from message paths', () => {
    expect(
      extractResourceFromApiCall('/discord/message/delete', {
        method: 'DELETE',
        path: '/channels/C2/messages/M5',
      }),
    ).toEqual({ channel_id: 'C2', message_id: 'M5' });
  });

  it('surfaces all three ids for member-role mutation', () => {
    expect(
      extractResourceFromApiCall('/discord/member/add_role', {
        method: 'PUT',
        path: '/guilds/G1/members/U2/roles/R3',
      }),
    ).toEqual({ guild_id: 'G1', user_id: 'U2', role_id: 'R3' });
  });

  it('returns null for non-discord paths so consistency check skips', () => {
    expect(
      extractResourceFromApiCall('/discord/guild/read', { method: 'GET', path: '/users/@me' }),
    ).toBeNull();
  });
});
