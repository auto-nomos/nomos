import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/google/sheets/spreadsheet/read',
  '/google/sheets/values/read',
] as const;
export const WRITES = [
  '/google/sheets/spreadsheet/create',
  '/google/sheets/values/update',
  '/google/sheets/values/append',
  '/google/sheets/spreadsheet/batch_update',
] as const;
export const actions = [...READS, ...WRITES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_sheets:read-only',
    integrationId: 'google_sheets',
    name: 'Read-only',
    description: 'Read spreadsheets and cell values. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_sheets:append-only',
    integrationId: 'google_sheets',
    name: 'Append-only',
    description: 'Read + append new rows. Cannot update existing cells or structure.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/sheets/values/append"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_sheets:read-and-create',
    integrationId: 'google_sheets',
    name: 'Read + create',
    description: 'Read everything; create new spreadsheets. No edits to existing data.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/sheets/spreadsheet/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_sheets:step-up-update',
    integrationId: 'google_sheets',
    name: 'Step-up for updates',
    description:
      'Read + create + append freely; updating existing cells or structure requires co-signer.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/sheets/spreadsheet/create", Action::"/google/sheets/values/append"],\n  resource\n);\n\npermit (\n  principal,\n  action in [Action::"/google/sheets/values/update", Action::"/google/sheets/spreadsheet/batch_update"],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google_sheets:full-write',
    integrationId: 'google_sheets',
    name: 'Full write',
    description: 'All read + write actions. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
];
