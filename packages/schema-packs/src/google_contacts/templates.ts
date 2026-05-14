import type { PolicyTemplate } from '../types.js';

/**
 * Google Contacts (People API) vocabulary. Reuses the google OAuth connector
 * — the dashboard requests `https://www.googleapis.com/auth/contacts.readonly`
 * alongside existing google scopes when this pack is enabled.
 */
export const READS = [
  '/google/contacts/list',
  '/google/contacts/search',
  '/google/contacts/read',
  '/google/contacts/group/list',
  '/google/contacts/group/read',
  '/google/contacts/batch_get',
] as const;
export const WRITES = ['/google/contacts/create', '/google/contacts/update'] as const;
export const DELETES = ['/google/contacts/delete'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_contacts:read-only',
    integrationId: 'google_contacts',
    name: 'Read-only',
    description:
      'List + search + read contacts. No writes (the YAML adapter ships read-only today).',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_contacts:scope-to-resource',
    integrationId: 'google_contacts',
    name: 'Scope to single contact',
    description: 'Read access narrowed to one specific resource_name (e.g. people/c12345).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { resource.resource_name == context.resource_constraint.resource_name };',
    visualReady: false,
  },
  {
    id: 'google_contacts:audit-only',
    integrationId: 'google_contacts',
    name: 'Audit-only',
    description: 'Allow all reads; force audit annotation on every call for compliance review.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.audit == true };`,
    visualReady: true,
  },
  {
    id: 'google_contacts:business-hours',
    integrationId: 'google_contacts',
    name: 'Business hours only',
    description: 'Allow contact reads only during business hours (09:00–17:00 UTC).',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };`,
    visualReady: true,
  },
  {
    id: 'google_contacts:rate-limited-read',
    integrationId: 'google_contacts',
    name: 'Rate-limited read',
    description: 'Allow contact reads, but enforce a per-agent quota via context.quota_remaining.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { context.quota_remaining > 0 };`,
    visualReady: true,
  },
];
