import { parsePolicy } from '@auto-nomos/cedar';
import { describe, expect, it } from 'vitest';
import { listTemplates, PACKS, templateById, templatesFor } from '../index.js';

describe('schema-packs templates', () => {
  it('ships 5 templates per integration', () => {
    for (const pack of PACKS) {
      expect(pack.templates).toHaveLength(5);
    }
    expect(listTemplates()).toHaveLength(PACKS.length * 5);
  });

  it('every template has a unique id', () => {
    const all = listTemplates();
    const ids = new Set(all.map((t) => t.id));
    expect(ids.size).toBe(all.length);
  });

  it('every template id is namespaced on its integration', () => {
    for (const t of listTemplates()) {
      expect(t.id.startsWith(`${t.integrationId}:`)).toBe(true);
    }
  });

  it('every template emits parseable Cedar', () => {
    for (const t of listTemplates()) {
      const r = parsePolicy(t.cedarText);
      if (!r.ok) {
        throw new Error(
          `template ${t.id} did not parse: ${r.errors.map((e) => e.message).join('; ')}`,
        );
      }
    }
  });

  it('templatesFor("github") returns the github pack', () => {
    expect(templatesFor('github')).toHaveLength(5);
    expect(templatesFor('github').every((t) => t.integrationId === 'github')).toBe(true);
  });

  it('templateById finds known + returns undefined for unknown', () => {
    expect(templateById('github:read-only')?.integrationId).toBe('github');
    expect(templateById('does-not-exist')).toBeUndefined();
  });
});
