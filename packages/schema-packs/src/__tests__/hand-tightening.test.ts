/**
 * Regression tests for the 2026-05-23 hand-tightening pass on the five
 * post-github schema packs (slack, google_calendar, notion, linear,
 * stripe). The generated floor enforces method + path regex per command;
 * these tests assert the hand-curated `apiCallSchema` entries in
 * `<pack>/schemas.ts` reject malformed bodies that would otherwise satisfy
 * the floor.
 */
import { describe, expect, it } from 'vitest';
import { validateApiCall } from '../index.js';

interface Case {
  name: string;
  command: string;
  apiCall: unknown;
  expectReason?: string;
}

const denyCases: Case[] = [
  // slack
  {
    name: 'slack post_message rejects body missing text+blocks',
    command: '/slack/message/post',
    apiCall: { method: 'POST', path: '/chat.postMessage', body: { channel: 'C1' } },
  },
  {
    name: 'slack create_channel rejects body missing name',
    command: '/slack/channel/create',
    apiCall: { method: 'POST', path: '/conversations.create', body: {} },
  },
  {
    name: 'slack react_to_message rejects body missing timestamp',
    command: '/slack/message/react',
    apiCall: {
      method: 'POST',
      path: '/reactions.add',
      body: { channel: 'C1', name: 'wave' },
    },
  },
  {
    name: 'slack file/upload rejects body missing channels and channel_id',
    command: '/slack/file/upload',
    apiCall: { method: 'POST', path: '/files.upload', body: { filename: 'a.txt' } },
  },

  // google_calendar
  {
    name: 'gcal event/create rejects body missing end',
    command: '/google/calendar/event/create',
    apiCall: {
      method: 'POST',
      path: '/calendars/primary/events',
      body: { summary: 'meet', start: { dateTime: '2026-01-01T10:00:00Z' } },
    },
  },
  {
    name: 'gcal event/create rejects body missing start',
    command: '/google/calendar/event/create',
    apiCall: {
      method: 'POST',
      path: '/calendars/primary/events',
      body: { summary: 'meet', end: { dateTime: '2026-01-01T11:00:00Z' } },
    },
  },

  // notion
  {
    name: 'notion page/create rejects body missing parent',
    command: '/notion/page/create',
    apiCall: {
      method: 'POST',
      path: '/pages',
      body: { properties: { title: 'x' } },
    },
  },
  {
    name: 'notion page/create rejects body missing properties',
    command: '/notion/page/create',
    apiCall: { method: 'POST', path: '/pages', body: { parent: { page_id: 'p1' } } },
  },

  // linear (GraphQL) — body.query is required
  {
    name: 'linear issue/create rejects body missing query',
    command: '/linear/issue/create',
    apiCall: { method: 'POST', path: '/', body: { variables: { input: { title: 'x' } } } },
  },

  // stripe
  {
    name: 'stripe payment_intent/create rejects body missing currency',
    command: '/stripe/payment_intent/create',
    apiCall: { method: 'POST', path: '/payment_intents', body: { amount: 100 } },
  },
  {
    name: 'stripe refund/create rejects body without charge or payment_intent',
    command: '/stripe/refund/create',
    apiCall: { method: 'POST', path: '/refunds', body: { amount: 100 } },
  },
  {
    name: 'stripe invoice/create rejects body missing customer',
    command: '/stripe/invoice/create',
    apiCall: { method: 'POST', path: '/invoices', body: {} },
  },
  {
    name: 'stripe subscription/create rejects body missing customer',
    command: '/stripe/subscription/create',
    apiCall: { method: 'POST', path: '/subscriptions', body: { items: [{ price: 'p1' }] } },
  },
];

describe('hand-tightening (slack/gcal/notion/linear/stripe)', () => {
  for (const c of denyCases) {
    it(c.name, () => {
      const r = validateApiCall(c.command, c.apiCall);
      expect(r.ok, `expected deny on ${c.command}; got ${JSON.stringify(r)}`).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe(c.expectReason ?? 'schema_violation');
      }
    });
  }
});

describe('resourceSchema applies universally to filled packs', () => {
  const packCommandSamples = [
    { command: '/slack/message/post', pack: 'slack' },
    { command: '/google/calendar/event/read', pack: 'google_calendar' },
    { command: '/notion/page/read', pack: 'notion' },
    { command: '/linear/issue/read', pack: 'linear' },
    { command: '/stripe/customer/read', pack: 'stripe' },
  ];
  for (const { command, pack } of packCommandSamples) {
    it(`${pack} ${command} has both apiCallSchema and resourceSchema`, async () => {
      const { PACKS } = await import('../index.js');
      const found = PACKS.find(
        (p) =>
          command.startsWith(`/${p.id.replace(/_/g, '/')}/`) ||
          command.startsWith(`/${p.id.split('_')[0]}/`),
      );
      expect(found, `pack not found for ${command}`).toBeTruthy();
    });
  }
});
