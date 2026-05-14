import type { GoogleGmailConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleGmailProxyCall } from '../adapters/google_gmail.js';

describe('validateGoogleGmailProxyCall', () => {
  const messageConstraint: GoogleGmailConstraint = {
    provider: 'google_gmail',
    user_id: 'me',
    message_id: 'msg_1',
  };

  it('allows in-scope read of the pinned message', () => {
    expect(
      validateGoogleGmailProxyCall(messageConstraint, {
        method: 'GET',
        path: '/users/me/messages/msg_1',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a different message', () => {
    expect(
      validateGoogleGmailProxyCall(messageConstraint, {
        method: 'GET',
        path: '/users/me/messages/msg_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'message_mismatch' });
  });

  it('thread-pinned constraint rejects different thread', () => {
    const tc: GoogleGmailConstraint = {
      provider: 'google_gmail',
      thread_id: 'thr_1',
    };
    expect(
      validateGoogleGmailProxyCall(tc, {
        method: 'GET',
        path: '/users/me/threads/thr_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'thread_mismatch' });
  });

  it('rejects non-gmail paths', () => {
    expect(
      validateGoogleGmailProxyCall(messageConstraint, {
        method: 'GET',
        path: '/files/file_X',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
