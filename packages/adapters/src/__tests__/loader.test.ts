import { describe, expect, it } from 'vitest';
import { AdapterParseError, loadAllAdapters, parseAdapter, SPEC_DIR } from '../loader.js';

const MINIMAL_VALID = `
id: example
name: Example
auth:
  kind: oauth2
  authorize_url: https://example.com/oauth/authorize
  token_url: https://example.com/oauth/token
  default_scopes: [read]
api_base: https://api.example.com
actions:
  - id: list_things
    description: List things
    expected_use: Browse things
    risk:
      category: read
      sensitivity: low
    http:
      method: GET
      path: /v1/things
`;

describe('loader', () => {
  it('parses a minimal valid adapter', () => {
    const a = parseAdapter(MINIMAL_VALID);
    expect(a.id).toBe('example');
    expect(a.actions).toHaveLength(1);
    expect(a.actions[0]?.http.method).toBe('GET');
  });

  it('rejects invalid YAML', () => {
    expect(() => parseAdapter('::: not yaml :::')).toThrow(AdapterParseError);
  });

  it('rejects spec missing required fields', () => {
    expect(() =>
      parseAdapter(`
id: bad
name: Bad
auth:
  kind: oauth2
  authorize_url: https://x.com/auth
  token_url: https://x.com/token
actions: []
`),
    ).toThrow(AdapterParseError);
  });

  it('rejects unknown auth kind', () => {
    expect(() =>
      parseAdapter(`
id: bad
name: Bad
auth:
  kind: psychic
actions:
  - id: x
    description: x
    expected_use: x
    risk: { category: read, sensitivity: low }
    http: { method: GET, path: /x }
`),
    ).toThrow(AdapterParseError);
  });

  it('loads pilot specs from spec/ dir', () => {
    const all = loadAllAdapters(SPEC_DIR);
    expect(all.size).toBeGreaterThanOrEqual(1);
    expect(all.has('github')).toBe(true);
  });

  it('ships all P1 adapters', () => {
    const all = loadAllAdapters(SPEC_DIR);
    const expected = [
      'github',
      'slack',
      'notion',
      'linear',
      'stripe',
      'google_gmail',
      'google_calendar',
      'google_drive',
      'google_contacts',
      'google_docs',
      'google_sheets',
      'google_tasks',
      'discord',
      'telegram',
      'dropbox',
      'twilio',
      'granola',
      'perplexity',
      'jira',
      'salesforce',
      'postgres',
      'imessage',
      'filesystem',
      'ssh',
    ];
    for (const id of expected) {
      expect(all.has(id), `missing adapter: ${id}`).toBe(true);
    }
    expect(all.size).toBe(expected.length);
  });

  it('local + ssh_key auth kinds load', () => {
    const all = loadAllAdapters(SPEC_DIR);
    const fs = all.get('filesystem');
    const ssh = all.get('ssh');
    expect(fs?.auth.kind).toBe('local');
    expect(ssh?.auth.kind).toBe('ssh_key');
  });

  it('every adapter declares at least one action with valid risk', () => {
    const all = loadAllAdapters(SPEC_DIR);
    for (const [id, spec] of all) {
      expect(spec.actions.length, `${id}: no actions`).toBeGreaterThan(0);
      for (const action of spec.actions) {
        expect(['read', 'search', 'write', 'delete']).toContain(action.risk.category);
        expect(['low', 'medium', 'high']).toContain(action.risk.sensitivity);
      }
    }
  });
});
