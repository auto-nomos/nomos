import type { PolicyTemplate } from '../types.js';

/**
 * Gmail vocabulary. Reuses the google OAuth connector — the dashboard
 * requests the gmail.readonly / gmail.modify / gmail.send scopes alongside
 * existing google scopes when this pack is enabled.
 */
export const READS = [
  '/google/gmail/message/list',
  '/google/gmail/message/read',
  '/google/gmail/thread/list',
  '/google/gmail/thread/read',
  '/google/gmail/label/list',
  '/google/gmail/profile/read',
] as const;
export const WRITES = [
  '/google/gmail/message/send',
  '/google/gmail/message/modify',
  '/google/gmail/draft/create',
] as const;
export const DELETES = ['/google/gmail/message/trash'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');
const DELETE_LIST = DELETES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_gmail:read-only',
    integrationId: 'google_gmail',
    name: 'Read-only',
    description: 'List + read messages and threads. No sending, modifying, or trashing.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_gmail:draft-and-label',
    integrationId: 'google_gmail',
    name: 'Draft + label',
    description: 'Read everything; create drafts + modify labels. Cannot send or trash.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/gmail/draft/create", Action::"/google/gmail/message/modify"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_gmail:step-up-send',
    integrationId: 'google_gmail',
    name: 'Step-up to send',
    description: 'Read + draft + modify freely; sending an email requires co-signer.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/gmail/draft/create", Action::"/google/gmail/message/modify"],\n  resource\n);\n\npermit (\n  principal,\n  action == Action::"/google/gmail/message/send",\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google_gmail:full',
    integrationId: 'google_gmail',
    name: 'Full write',
    description: 'All read, send, modify, and trash actions. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}, ${DELETE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_gmail:read-and-draft',
    integrationId: 'google_gmail',
    name: 'Read + draft only',
    description: 'Read messages and prepare drafts. No sending, modifying, or trashing.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/gmail/draft/create"],\n  resource\n);`,
    visualReady: true,
  },
];
