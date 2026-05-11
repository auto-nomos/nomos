import type { AddressInfo } from 'node:net';
import { createAuthGuard } from '@auto-nomos/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { Octokit } from 'octokit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIssue, mergePr, readRepo } from '../tools.js';

const VALID_KEY = 'cb_22222222-2222-2222-2222-222222222222_secret';

interface PdpMock {
  url: string;
  close: () => Promise<void>;
  authorizeCalls: Array<{ command: string; resource: Record<string, unknown> }>;
  setRule: (
    rule: (req: { command: string; resource: Record<string, unknown> }) => {
      allow: boolean;
      reason?: string;
    },
  ) => void;
}

async function bootMockPdp(): Promise<PdpMock> {
  const handle: PdpMock = {
    url: '',
    close: async () => {},
    authorizeCalls: [],
    setRule: () => {},
  };
  let rule: (req: { command: string; resource: Record<string, unknown> }) => {
    allow: boolean;
    reason?: string;
  } = () => ({ allow: true });
  handle.setRule = (r) => {
    rule = r;
  };

  const app = new Hono();
  app.post('/v1/authorize', async (c) => {
    const body = (await c.req.json()) as { command: string; resource: Record<string, unknown> };
    handle.authorizeCalls.push({ command: body.command, resource: body.resource });
    const decision = rule(body);
    return c.json(
      {
        allow: decision.allow,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
        receiptId: `r-${handle.authorizeCalls.length}`,
      },
      200,
    );
  });
  app.post('/v1/receipts', (c) => c.json({ ok: true }, 200));

  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  handle.url = `http://127.0.0.1:${addr.port}`;
  handle.close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return handle;
}

const githubServer = setupServer();

beforeAll(() =>
  githubServer.listen({
    onUnhandledRequest: (req, print) => {
      if (req.url.startsWith('http://127.0.0.1') || req.url.startsWith('http://localhost')) {
        return; // let real localhost servers (mock PDP) through
      }
      print.error();
    },
  }),
);
afterEach(() => githubServer.resetHandlers());
afterAll(() => githubServer.close());

let pdp: PdpMock;
let octokit: Octokit;
let deps: { guard: ReturnType<typeof createAuthGuard>; octokit: Octokit; ucan: string };

beforeEach(async () => {
  pdp = await bootMockPdp();
  octokit = new Octokit({ auth: 'ghp_fake' });
  deps = {
    guard: createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: pdp.url,
      retry: { maxAttempts: 1, baseDelayMs: 1 },
    }),
    octokit,
    ucan: 'eyJ.fake.ucan',
  };
});

afterEach(async () => {
  await pdp.close();
});

describe('create_issue', () => {
  it('PDP allow → calls GitHub and returns issue url', async () => {
    let githubCalls = 0;
    githubServer.use(
      http.post('https://api.github.com/repos/acme/billing/issues', () => {
        githubCalls++;
        return HttpResponse.json({
          number: 7,
          html_url: 'https://github.com/acme/billing/issues/7',
        });
      }),
    );

    const result = await createIssue(deps, {
      owner: 'acme',
      repo: 'billing',
      title: 'bug',
    });
    expect(result.status).toBe('allowed');
    expect((result.data as { number: number }).number).toBe(7);
    expect(githubCalls).toBe(1);
    expect(pdp.authorizeCalls[0]).toMatchObject({
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
    });
  });

  it('PDP deny (no UCAN / policy denied) → does NOT call GitHub', async () => {
    pdp.setRule(() => ({ allow: false, reason: 'policy_denied' }));
    let githubCalls = 0;
    githubServer.use(
      http.post('https://api.github.com/repos/acme/billing/issues', () => {
        githubCalls++;
        return HttpResponse.json({});
      }),
    );

    const result = await createIssue(deps, { owner: 'acme', repo: 'billing', title: 'x' });
    expect(result.status).toBe('denied');
    expect(result.decision?.reason).toBe('policy_denied');
    expect(githubCalls).toBe(0);
  });

  it('PDP unreachable → fail-closed deny, GitHub not called', async () => {
    const url = pdp.url;
    await pdp.close();
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: url,
      retry: { maxAttempts: 1, baseDelayMs: 1 },
    });
    let githubCalls = 0;
    githubServer.use(
      http.post('https://api.github.com/repos/acme/billing/issues', () => {
        githubCalls++;
        return HttpResponse.json({});
      }),
    );

    const result = await createIssue(
      { ...deps, guard },
      { owner: 'acme', repo: 'billing', title: 'x' },
    );
    expect(result.status).toBe('denied');
    expect(result.decision?.reason).toBe('pdp_unreachable');
    expect(githubCalls).toBe(0);

    pdp = await bootMockPdp(); // restore for afterEach
  });

  it('GitHub returns 4xx → tool returns failed (still allowed)', async () => {
    githubServer.use(
      http.post('https://api.github.com/repos/acme/billing/issues', () =>
        HttpResponse.json({ message: 'Validation Failed' }, { status: 422 }),
      ),
    );
    const result = await createIssue(deps, { owner: 'acme', repo: 'billing', title: 'x' });
    expect(result.status).toBe('failed');
    expect(result.error).toBeTypeOf('string');
  });
});

describe('merge_pr', () => {
  it('UCAN scoped to issue create only (PDP enforces cmd_mismatch) → denied', async () => {
    pdp.setRule((req) =>
      req.command === '/github/issue/create'
        ? { allow: true }
        : { allow: false, reason: 'command_mismatch' },
    );
    let githubCalls = 0;
    githubServer.use(
      http.put('https://api.github.com/repos/acme/billing/pulls/9/merge', () => {
        githubCalls++;
        return HttpResponse.json({});
      }),
    );
    const result = await mergePr(deps, { owner: 'acme', repo: 'billing', prNumber: 9 });
    expect(result.status).toBe('denied');
    expect(result.decision?.reason).toBe('command_mismatch');
    expect(githubCalls).toBe(0);
  });
});

describe('resource scoping', () => {
  it('UCAN scoped to acme/repo-A; attempt acme/repo-B → denied', async () => {
    pdp.setRule((req) =>
      (req.resource as { repo: string }).repo === 'acme/repo-A'
        ? { allow: true }
        : { allow: false, reason: 'policy_denied' },
    );
    let githubCallsA = 0;
    let githubCallsB = 0;
    githubServer.use(
      http.post('https://api.github.com/repos/acme/repo-A/issues', () => {
        githubCallsA++;
        return HttpResponse.json({
          number: 1,
          html_url: 'https://github.com/acme/repo-A/issues/1',
        });
      }),
      http.post('https://api.github.com/repos/acme/repo-B/issues', () => {
        githubCallsB++;
        return HttpResponse.json({
          number: 1,
          html_url: 'https://github.com/acme/repo-B/issues/1',
        });
      }),
    );

    const allowed = await createIssue(deps, { owner: 'acme', repo: 'repo-A', title: 'x' });
    expect(allowed.status).toBe('allowed');
    expect(githubCallsA).toBe(1);

    const denied = await createIssue(deps, { owner: 'acme', repo: 'repo-B', title: 'x' });
    expect(denied.status).toBe('denied');
    expect(githubCallsB).toBe(0);
  });
});

describe('read_repo', () => {
  it('PDP allow → returns repo metadata', async () => {
    githubServer.use(
      http.get('https://api.github.com/repos/acme/billing', () =>
        HttpResponse.json({
          full_name: 'acme/billing',
          private: false,
          default_branch: 'main',
        }),
      ),
    );
    const result = await readRepo(deps, { owner: 'acme', repo: 'billing' });
    expect(result.status).toBe('allowed');
    expect((result.data as { name: string }).name).toBe('acme/billing');
    expect(pdp.authorizeCalls[0]?.command).toBe('/github/repo/read');
  });
});
