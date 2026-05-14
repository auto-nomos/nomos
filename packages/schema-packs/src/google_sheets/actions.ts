/**
 * Mapping from `packages/adapters/spec/google_sheets.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/sheets/...`.
 */

export const actionToCommand: Record<string, string> = {
  create_spreadsheet: '/google/sheets/spreadsheet/create',
  get_spreadsheet: '/google/sheets/spreadsheet/read',
  get_values: '/google/sheets/values/read',
  update_values: '/google/sheets/values/update',
  append_values: '/google/sheets/values/append',
  batch_update: '/google/sheets/spreadsheet/batch_update',
  clear_values: '/google/sheets/values/clear',
  batch_get_values: '/google/sheets/values/batch_get',
  copy_spreadsheet: '/google/sheets/spreadsheet/copy',
  list_developer_metadata: '/google/sheets/metadata/list',
  batch_update_values: '/google/sheets/values/batch_update',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const spreadsheetId = typeof params.spreadsheetId === 'string' ? params.spreadsheetId : undefined;
  const range = typeof params.range === 'string' ? params.range : undefined;

  switch (actionId) {
    case 'create_spreadsheet':
      return {};
    case 'get_spreadsheet':
    case 'batch_update':
    case 'list_developer_metadata':
    case 'batch_update_values':
    case 'copy_spreadsheet':
      return spreadsheetId ? { spreadsheet: spreadsheetId } : {};
    case 'get_values':
    case 'update_values':
    case 'append_values':
    case 'clear_values':
    case 'batch_get_values':
      return {
        ...(spreadsheetId ? { spreadsheet: spreadsheetId } : {}),
        ...(range ? { range } : {}),
      };
    default:
      return {};
  }
}
