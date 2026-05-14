import type { GoogleSheetsConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleSheetsProxyCall } from '../adapters/google_sheets.js';

describe('validateGoogleSheetsProxyCall', () => {
  const sheetConstraint: GoogleSheetsConstraint = {
    provider: 'google_sheets',
    spreadsheet_id: 'ss_1',
  };

  it('allows in-scope read of pinned spreadsheet', () => {
    expect(
      validateGoogleSheetsProxyCall(sheetConstraint, {
        method: 'GET',
        path: '/spreadsheets/ss_1',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects values.get on a different spreadsheet', () => {
    expect(
      validateGoogleSheetsProxyCall(sheetConstraint, {
        method: 'GET',
        path: '/spreadsheets/ss_OTHER/values/Sheet1!A1',
      }),
    ).toEqual({ ok: false, reason: 'spreadsheet_mismatch' });
  });

  it('range-pinned constraint rejects different range', () => {
    const rc: GoogleSheetsConstraint = {
      provider: 'google_sheets',
      spreadsheet_id: 'ss_1',
      range: 'Sheet1!A1:B10',
    };
    expect(
      validateGoogleSheetsProxyCall(rc, {
        method: 'GET',
        path: `/spreadsheets/ss_1/values/${encodeURIComponent('Sheet1!A1:B10')}`,
      }),
    ).toEqual({ ok: true });
    expect(
      validateGoogleSheetsProxyCall(rc, {
        method: 'GET',
        path: `/spreadsheets/ss_1/values/${encodeURIComponent('Sheet2!A1:B10')}`,
      }),
    ).toEqual({ ok: false, reason: 'range_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateGoogleSheetsProxyCall(sheetConstraint, {
        method: 'GET',
        path: '/documents/ss_1',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
