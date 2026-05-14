import type { SlackConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateSlackProxyCall } from '../adapters/slack.js';

describe('validateSlackProxyCall', () => {
  const channelConstraint: SlackConstraint = {
    provider: 'slack',
    channel_id: 'C012ABC',
  };

  it('allows in-scope post to the pinned channel', () => {
    expect(
      validateSlackProxyCall(channelConstraint, {
        method: 'POST',
        path: '/chat.postMessage',
        body: { channel: 'C012ABC', text: 'hi' },
      }),
    ).toEqual({ ok: true });
  });

  it('rejects post to a different channel via body.channel', () => {
    expect(
      validateSlackProxyCall(channelConstraint, {
        method: 'POST',
        path: '/chat.postMessage',
        body: { channel: 'C999XYZ', text: 'leak' },
      }),
    ).toEqual({ ok: false, reason: 'channel_mismatch' });
  });

  it('rejects history read of a different channel via query', () => {
    expect(
      validateSlackProxyCall(channelConstraint, {
        method: 'GET',
        path: '/conversations.history',
        query: { channel: 'C999XYZ' },
      }),
    ).toEqual({ ok: false, reason: 'channel_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateSlackProxyCall(channelConstraint, {
        method: 'GET',
        path: '/some/other/api/path',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });

  it('thread-pinned constraint rejects different thread_ts', () => {
    const tc: SlackConstraint = {
      provider: 'slack',
      channel_id: 'C012ABC',
      thread_ts: '1234.5678',
    };
    expect(
      validateSlackProxyCall(tc, {
        method: 'POST',
        path: '/chat.postMessage',
        body: { channel: 'C012ABC', text: 'hi', thread_ts: '9999.0000' },
      }),
    ).toEqual({ ok: false, reason: 'thread_ts_mismatch' });
  });

  it('user-pinned constraint allows DM to that user', () => {
    const uc: SlackConstraint = { provider: 'slack', user_id: 'U123' };
    expect(
      validateSlackProxyCall(uc, {
        method: 'POST',
        path: '/conversations.open',
        body: { user: 'U123' },
      }),
    ).toEqual({ ok: true });
    expect(
      validateSlackProxyCall(uc, {
        method: 'POST',
        path: '/conversations.open',
        body: { user: 'U999' },
      }),
    ).toEqual({ ok: false, reason: 'user_mismatch' });
  });
});
