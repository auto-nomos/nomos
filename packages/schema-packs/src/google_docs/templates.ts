import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/google/docs/document/read',
  '/google/docs/document/revisions/read',
] as const;
export const WRITES = [
  '/google/docs/document/create',
  '/google/docs/document/batch_update',
  '/google/docs/document/replace_text',
  '/google/docs/document/insert_text',
  '/google/docs/document/format_text',
  '/google/docs/document/insert_table',
  '/google/docs/document/insert_image',
  '/google/docs/document/named_range/create',
] as const;
export const DELETES = ['/google/docs/document/delete_text'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_docs:read-only',
    integrationId: 'google_docs',
    name: 'Read-only',
    description: 'Read document content. No creation, edits, or replacements.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_docs:create-only',
    integrationId: 'google_docs',
    name: 'Create-only',
    description: 'Read + create new documents. No mutations to existing docs.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/docs/document/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_docs:read-and-create',
    integrationId: 'google_docs',
    name: 'Read + create',
    description: 'Same as create-only with an explicit name for the wizard.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/docs/document/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_docs:step-up-edit',
    integrationId: 'google_docs',
    name: 'Step-up for edits',
    description:
      'Read + create freely; batch_update / replace_text require co-signer approval each call.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/docs/document/create"],\n  resource\n);\n\npermit (\n  principal,\n  action in [Action::"/google/docs/document/batch_update", Action::"/google/docs/document/replace_text"],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google_docs:full-write',
    integrationId: 'google_docs',
    name: 'Full write',
    description: 'All read + write actions including in-place edits. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
];
