/**
 * Google Sheets paths (api_base `https://sheets.googleapis.com/v4`):
 *   /spreadsheets
 *   /spreadsheets/{spreadsheetId}
 *   /spreadsheets/{spreadsheetId}:batchUpdate
 *   /spreadsheets/{spreadsheetId}/values/{range}
 *   /spreadsheets/{spreadsheetId}/values/{range}:append
 *
 * `range` may contain `!` and `:` (e.g. `Sheet1!A1:C10`) — URI-encoded
 * by the client, decoded here for comparison.
 */
export function parseGoogleSheetsPath(path: string): {
  spreadsheet_id?: string;
  range?: string;
  action?: 'batchUpdate' | 'append' | 'values';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] !== 'spreadsheets') return null;
  if (!segs[1]) return {};
  const idSeg = segs[1];
  const colonIdx = idSeg.indexOf(':');
  const out: ReturnType<typeof parseGoogleSheetsPath> = {};
  if (colonIdx === -1) {
    out!.spreadsheet_id = idSeg;
  } else {
    out!.spreadsheet_id = idSeg.slice(0, colonIdx);
    const verb = idSeg.slice(colonIdx + 1);
    if (verb === 'batchUpdate') out!.action = 'batchUpdate';
  }
  if (segs[2] === 'values' && segs[3]) {
    const rangeSeg = decodeURIComponent(segs[3]);
    const rangeColon = rangeSeg.lastIndexOf(':');
    if (rangeColon === -1) {
      out!.range = rangeSeg;
      out!.action ??= 'values';
    } else {
      const trailing = rangeSeg.slice(rangeColon + 1);
      // `A1:B2` is a real range; `:append` is the verb. Treat trailing
      // ASCII-only token starting lowercase as a verb suffix.
      if (/^[a-z][A-Za-z]+$/.test(trailing)) {
        out!.range = rangeSeg.slice(0, rangeColon);
        if (trailing === 'append') out!.action = 'append';
      } else {
        out!.range = rangeSeg;
        out!.action ??= 'values';
      }
    }
  }
  return out;
}
