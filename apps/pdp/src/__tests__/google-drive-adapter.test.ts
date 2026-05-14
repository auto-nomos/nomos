import type { GoogleDriveConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleDriveProxyCall } from '../adapters/google_drive.js';

describe('validateGoogleDriveProxyCall', () => {
  const fileConstraint: GoogleDriveConstraint = {
    provider: 'google_drive',
    file_id: 'file_ACME',
  };

  it('allows in-scope read on the pinned file', () => {
    expect(
      validateGoogleDriveProxyCall(fileConstraint, {
        method: 'GET',
        path: '/files/file_ACME',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects different file', () => {
    expect(
      validateGoogleDriveProxyCall(fileConstraint, {
        method: 'GET',
        path: '/files/file_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'file_mismatch' });
  });

  it('folder-pinned constraint allows create_file under that parent', () => {
    const fc: GoogleDriveConstraint = {
      provider: 'google_drive',
      folder_id: 'folder_ACME',
    };
    expect(
      validateGoogleDriveProxyCall(fc, {
        method: 'POST',
        path: '/files',
        body: { name: 'x', parents: ['folder_ACME'] },
      }),
    ).toEqual({ ok: true });
    expect(
      validateGoogleDriveProxyCall(fc, {
        method: 'POST',
        path: '/files',
        body: { name: 'x', parents: ['folder_OTHER'] },
      }),
    ).toEqual({ ok: false, reason: 'folder_mismatch' });
  });

  it('rejects non-drive paths', () => {
    expect(
      validateGoogleDriveProxyCall(fileConstraint, {
        method: 'GET',
        path: '/users/me/messages',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });

  it('drive_id constraint enforces via query', () => {
    const dc: GoogleDriveConstraint = {
      provider: 'google_drive',
      drive_id: 'drive_ACME',
    };
    expect(
      validateGoogleDriveProxyCall(dc, {
        method: 'GET',
        path: '/files',
        query: { driveId: 'drive_OTHER' },
      }),
    ).toEqual({ ok: false, reason: 'drive_mismatch' });
  });
});
