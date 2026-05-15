import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  expandRolePermissions,
  hasPermission,
  RESOURCES,
  ROLES,
  rolePermissionPairs,
} from '../permissions.js';

describe('rbac permission matrix', () => {
  describe('owner', () => {
    it('can perform every action on every resource', () => {
      for (const r of RESOURCES) {
        for (const a of ACTIONS) {
          expect(hasPermission('owner', r, a), `owner ${r}:${a}`).toBe(true);
        }
      }
    });
  });

  describe('admin', () => {
    it('cannot delete the org', () => {
      expect(hasPermission('admin', 'org', 'delete')).toBe(false);
    });
    it('can read/create/update the org', () => {
      expect(hasPermission('admin', 'org', 'read')).toBe(true);
      expect(hasPermission('admin', 'org', 'create')).toBe(true);
      expect(hasPermission('admin', 'org', 'update')).toBe(true);
    });
    it('cannot mutate billing', () => {
      expect(hasPermission('admin', 'billing', 'update')).toBe(false);
      expect(hasPermission('admin', 'billing', 'delete')).toBe(false);
    });
    it('can read billing', () => {
      expect(hasPermission('admin', 'billing', 'read')).toBe(true);
    });
    it('can CRUD members, invites, agents, policies', () => {
      for (const r of ['members', 'invites', 'agents', 'policies'] as const) {
        for (const a of ACTIONS) {
          expect(hasPermission('admin', r, a)).toBe(true);
        }
      }
    });
  });

  describe('agent_manager', () => {
    it('can CRUD agents and grants', () => {
      for (const r of ['agents', 'grants', 'swarms', 'mcp_servers'] as const) {
        for (const a of ACTIONS) {
          expect(hasPermission('agent_manager', r, a)).toBe(true);
        }
      }
    });
    it('cannot mutate policies', () => {
      expect(hasPermission('agent_manager', 'policies', 'create')).toBe(false);
      expect(hasPermission('agent_manager', 'policies', 'update')).toBe(false);
      expect(hasPermission('agent_manager', 'policies', 'delete')).toBe(false);
    });
    it('can read policies + audit', () => {
      expect(hasPermission('agent_manager', 'policies', 'read')).toBe(true);
      expect(hasPermission('agent_manager', 'audit', 'read')).toBe(true);
    });
    it('cannot mutate members or org', () => {
      expect(hasPermission('agent_manager', 'members', 'create')).toBe(false);
      expect(hasPermission('agent_manager', 'org', 'update')).toBe(false);
    });
  });

  describe('policy_author', () => {
    it('can CRUD policies/schemas/envelopes', () => {
      for (const r of ['policies', 'schemas', 'envelopes'] as const) {
        for (const a of ACTIONS) {
          expect(hasPermission('policy_author', r, a)).toBe(true);
        }
      }
    });
    it('cannot mutate agents', () => {
      expect(hasPermission('policy_author', 'agents', 'create')).toBe(false);
    });
    it('can read agents + audit', () => {
      expect(hasPermission('policy_author', 'agents', 'read')).toBe(true);
      expect(hasPermission('policy_author', 'audit', 'read')).toBe(true);
    });
  });

  describe('auditor', () => {
    it('reads everything they have access to', () => {
      const expectedRead: ReadonlyArray<(typeof RESOURCES)[number]> = [
        'audit',
        'agents',
        'policies',
        'schemas',
        'grants',
        'swarms',
        'mcp_servers',
        'envelopes',
        'api_keys',
        'oauth',
        'cloud_connections',
        'org',
        'members',
        'invites',
      ];
      for (const r of expectedRead) {
        expect(hasPermission('auditor', r, 'read'), `auditor ${r}:read`).toBe(true);
      }
    });
    it('cannot mutate anything', () => {
      for (const r of RESOURCES) {
        for (const a of ACTIONS) {
          if (a === 'read') continue;
          expect(hasPermission('auditor', r, a), `auditor ${r}:${a}`).toBe(false);
        }
      }
    });
  });

  describe('member', () => {
    it('can read org + members', () => {
      expect(hasPermission('member', 'org', 'read')).toBe(true);
      expect(hasPermission('member', 'members', 'read')).toBe(true);
    });
    it('cannot read audit / agents / policies at the matrix level', () => {
      expect(hasPermission('member', 'audit', 'read')).toBe(false);
      expect(hasPermission('member', 'agents', 'read')).toBe(false);
      expect(hasPermission('member', 'policies', 'read')).toBe(false);
    });
    it('cannot mutate anything', () => {
      for (const r of RESOURCES) {
        for (const a of ACTIONS) {
          if (a === 'read') continue;
          expect(hasPermission('member', r, a)).toBe(false);
        }
      }
    });
  });

  describe('expandRolePermissions', () => {
    it('returns a bundle that matches hasPermission', () => {
      for (const role of ROLES) {
        const bundle = expandRolePermissions(role);
        for (const r of RESOURCES) {
          for (const a of ACTIONS) {
            const fromBundle = bundle[r]?.includes(a) ?? false;
            expect(fromBundle).toBe(hasPermission(role, r, a));
          }
        }
      }
    });
  });

  describe('rolePermissionPairs', () => {
    it('round-trips into hasPermission', () => {
      for (const role of ROLES) {
        const pairs = rolePermissionPairs(role);
        for (const pair of pairs) {
          const [resource, action] = pair.split(':') as [
            (typeof RESOURCES)[number],
            (typeof ACTIONS)[number],
          ];
          expect(hasPermission(role, resource, action)).toBe(true);
        }
      }
    });
    it('owner produces the maximum count (every resource × every action)', () => {
      expect(rolePermissionPairs('owner').length).toBe(RESOURCES.length * ACTIONS.length);
    });
  });
});
