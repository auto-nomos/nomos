import type { LinearConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateLinearProxyCall } from '../adapters/linear.js';

describe('validateLinearProxyCall', () => {
  const teamConstraint: LinearConstraint = {
    provider: 'linear',
    team_id: 'team_ACME',
  };

  it('allows in-scope GraphQL query on the pinned team', () => {
    expect(
      validateLinearProxyCall(teamConstraint, {
        method: 'POST',
        path: '/',
        body: {
          query: 'query GetTeam($teamId: String!) { team(id: $teamId) { id } }',
          variables: { teamId: 'team_ACME' },
        },
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a mutation pointing at a different team via variables', () => {
    expect(
      validateLinearProxyCall(teamConstraint, {
        method: 'POST',
        path: '/',
        body: {
          query:
            'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success } }',
          variables: { input: { teamId: 'team_OTHER', title: 'leak' } },
        },
      }),
    ).toEqual({ ok: false, reason: 'team_mismatch' });
  });

  it('rejects calls to non-GraphQL paths', () => {
    expect(
      validateLinearProxyCall(teamConstraint, {
        method: 'POST',
        path: '/v1/something',
        body: { query: '{ viewer { id } }' },
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });

  it('rejects missing body', () => {
    expect(
      validateLinearProxyCall(teamConstraint, {
        method: 'POST',
        path: '/',
      }),
    ).toEqual({ ok: false, reason: 'missing_body' });
  });

  it('rejects body without a query', () => {
    expect(
      validateLinearProxyCall(teamConstraint, {
        method: 'POST',
        path: '/',
        body: { variables: { teamId: 'team_ACME' } },
      }),
    ).toEqual({ ok: false, reason: 'unparseable_body' });
  });

  it('issue-pinned constraint rejects different issue id', () => {
    const ic: LinearConstraint = {
      provider: 'linear',
      issue_id: 'issue_1',
    };
    expect(
      validateLinearProxyCall(ic, {
        method: 'POST',
        path: '/',
        body: {
          query: 'mutation IssueArchive($id: String!) { issueArchive(id: $id) { success } }',
          variables: { id: 'issue_OTHER' },
        },
      }),
    ).toEqual({ ok: false, reason: 'issue_mismatch' });
  });
});
