import { describe, expect, it } from 'vitest';
import { scopeCedarToAgents } from '../bundle.js';

describe('scopeCedarToAgents', () => {
  it('returns empty string when no DIDs are mapped', () => {
    const out = scopeCedarToAgents('permit(principal, action, resource);', []);
    expect(out).toBe('');
  });

  it('rewrites bare-principal head to principal == Agent::"<did>" for each mapped DID', () => {
    const cedar = `permit (\n  principal,\n  action == Action::"/github/repo/read",\n  resource\n);`;
    const out = scopeCedarToAgents(cedar, ['did:key:alpha', 'did:key:beta']);
    expect(out).toContain('principal == Agent::"did:key:alpha"');
    expect(out).toContain('principal == Agent::"did:key:beta"');
    expect(out).toContain('scoped to Agent::did:key:alpha');
    expect(out).toContain('scoped to Agent::did:key:beta');
    // each DID produces its own copy of the rule
    const occurrences = (out.match(/action == Action::"\/github\/repo\/read"/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it('leaves policies that already constrain principal untouched', () => {
    const cedar = `permit (\n  principal == Agent::"did:key:hardcoded",\n  action,\n  resource\n);`;
    const out = scopeCedarToAgents(cedar, ['did:key:alpha', 'did:key:beta']);
    expect(out).toBe(cedar);
  });

  it('preserves attribute annotations and when clauses', () => {
    const cedar = `@id("p1")\npermit (\n  principal,\n  action == Action::"/x/y",\n  resource\n) when { resource.id == "42" };`;
    const out = scopeCedarToAgents(cedar, ['did:key:zeta']);
    expect(out).toContain('@id("p1")');
    expect(out).toContain('principal == Agent::"did:key:zeta"');
    expect(out).toContain('when { resource.id == "42" }');
  });

  it('escapes embedded quotes in DIDs', () => {
    const cedar = 'permit(principal, action, resource);';
    // DIDs really shouldn't contain quotes, but bundle must defend Cedar syntax.
    const out = scopeCedarToAgents(cedar, ['did:key:"hi"']);
    expect(out).toContain('Agent::"did:key:\\"hi\\""');
  });
});
