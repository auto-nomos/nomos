/**
 * Tier 1 — MCP-equivalent direct probes for prod dogfood
 * (2026-05-23 campaign).
 *
 * Bypasses the MCP host (which has a stale CB_API_KEY) and hits PDP
 * /v1/proxy directly with the same payload shape `runGuarded` builds.
 *
 * Env:
 *   NOMOS_API_KEY     dogfood agent admin api key (cb_<orgId>_<secret>)
 *   NOMOS_ORG_ID      org/customer uuid
 *   GITHUB_TEST_REPO  e.g. "varendra007/nomos-dogfood-target"  (read-only)
 *   GOOGLE_TEST_FILE  optional Drive file id for read probe
 *   NOTION_TEST_PAGE  optional Notion page id for read probe
 *   SLACK_TEST_CHAN   optional Slack channel id for read+post probe
 */

import { CONTROL_PLANE, mintStaticUcan, PDP, pdpProxy, Results, req } from './lib-prod-harness.mts';

async function probe(
  results: Results,
  label: string,
  apiKey: string,
  orgId: string,
  command: string,
  apiCall: Parameters<typeof pdpProxy>[0]['apiCall'],
  resource: Record<string, unknown> = {},
  expect: 'allow' | 'deny-cosigner' | 'deny' = 'allow',
): Promise<void> {
  let ucan: string;
  try {
    ucan = await mintStaticUcan({ controlPlane: CONTROL_PLANE, apiKey, commands: [command] });
  } catch (e) {
    results.fail(label, `mint failed: ${(e as Error).message.slice(0, 200)}`);
    return;
  }
  const r = await pdpProxy({ pdp: PDP, orgId, command, ucan, resource, apiCall });
  const b = r.body as {
    allow?: boolean;
    decision?: {
      allow: boolean;
      reason?: string;
      receiptId?: string;
      requiresStepUp?: boolean;
      stepUpId?: string;
    };
    upstream?: { status: number };
    error_code?: string;
  };
  const allow = b.allow ?? b.decision?.allow ?? false;
  const reason = b.decision?.reason ?? b.error_code ?? '';
  const upstreamStatus = b.upstream?.status;
  const stepUp = b.decision?.requiresStepUp ? ` stepUpId=${b.decision.stepUpId}` : '';

  if (expect === 'allow' && allow) {
    results.pass(label, `upstream=${upstreamStatus ?? '?'}`);
  } else if (
    expect === 'deny-cosigner' &&
    !allow &&
    (reason.includes('cosigner') ||
      reason.includes('stepup') ||
      reason.includes('step_up') ||
      b.decision?.requiresStepUp)
  ) {
    results.pass(label, `step_up triggered${stepUp}`);
  } else if (expect === 'deny' && !allow) {
    results.pass(label, `denied reason=${reason}`);
  } else {
    results.fail(
      label,
      `expected=${expect} allow=${allow} reason=${reason} status=${upstreamStatus}${stepUp}`,
    );
  }
}

async function main(): Promise<void> {
  const apiKey = req('NOMOS_API_KEY');
  const orgId = req('NOMOS_ORG_ID');
  const githubRepo = process.env.GITHUB_TEST_REPO ?? '';
  const slackChan = process.env.SLACK_TEST_CHAN ?? '';
  const googleFile = process.env.GOOGLE_TEST_FILE ?? '';
  const notionPage = process.env.NOTION_TEST_PAGE ?? '';

  const r = new Results();

  console.log('# github');
  await probe(r, 'github_get_user (read)', apiKey, orgId, '/github/user/read', {
    method: 'GET',
    path: '/user',
  });
  await probe(r, 'github_list_repos (read)', apiKey, orgId, '/github/repo/list', {
    method: 'GET',
    path: '/user/repos',
    query: { per_page: '5' },
  });
  if (githubRepo) {
    const [owner, repo] = githubRepo.split('/');
    await probe(
      r,
      'github_list_issues (read)',
      apiKey,
      orgId,
      '/github/issue/list',
      {
        method: 'GET',
        path: `/repos/${owner}/${repo}/issues`,
        query: { state: 'open', per_page: '3' },
      },
      { repo: githubRepo },
    );
    await probe(
      r,
      'github_create_issue (write)',
      apiKey,
      orgId,
      '/github/issue/create',
      {
        method: 'POST',
        path: `/repos/${owner}/${repo}/issues`,
        body: {
          title: `Nomos dogfood probe ${new Date().toISOString()}`,
          body: 'Created by Nomos prod e2e harness. Safe to close.',
        },
      },
      { repo: githubRepo },
    );
    await probe(
      r,
      'github_delete_repo (cosigner)',
      apiKey,
      orgId,
      '/github/repo/delete',
      { method: 'DELETE', path: `/repos/${owner}/${repo}` },
      { repo: githubRepo },
      'deny-cosigner',
    );
  } else {
    console.log('  (skip github writes — set GITHUB_TEST_REPO=owner/repo)');
  }

  console.log('# google (drive)');
  await probe(r, 'google_list_files (read)', apiKey, orgId, '/google/drive/list', {
    method: 'GET',
    path: '/files',
    query: { pageSize: '5', fields: 'files(id,name,mimeType)' },
  });
  if (googleFile) {
    await probe(
      r,
      'google_get_file (read)',
      apiKey,
      orgId,
      '/google/drive/read',
      { method: 'GET', path: `/files/${googleFile}` },
      { file_id: googleFile },
    );
    await probe(
      r,
      'google_delete_file (cosigner)',
      apiKey,
      orgId,
      '/google/drive/delete',
      { method: 'DELETE', path: `/files/${googleFile}` },
      { file_id: googleFile },
      'deny-cosigner',
    );
  }
  await probe(r, 'google_storage_quota (read)', apiKey, orgId, '/google/drive/quota/read', {
    method: 'GET',
    path: '/about',
    query: { fields: 'storageQuota,user' },
  });

  console.log('# notion');
  await probe(r, 'notion_search (read)', apiKey, orgId, '/notion/search', {
    method: 'POST',
    path: '/search',
    body: { query: 'test', page_size: 3 },
  });
  await probe(r, 'notion_list_users (read)', apiKey, orgId, '/notion/user/list', {
    method: 'GET',
    path: '/users',
    query: { page_size: '3' },
  });
  await probe(r, 'notion_get_bot_user (read)', apiKey, orgId, '/notion/user/me', {
    method: 'GET',
    path: '/users/me',
  });
  if (notionPage) {
    await probe(
      r,
      'notion_get_page (read)',
      apiKey,
      orgId,
      '/notion/page/read',
      { method: 'GET', path: `/pages/${notionPage}` },
      { page_id: notionPage },
    );
    await probe(
      r,
      'notion_delete_block (cosigner)',
      apiKey,
      orgId,
      '/notion/block/delete',
      { method: 'DELETE', path: `/blocks/${notionPage}` },
      { block_id: notionPage },
      'deny-cosigner',
    );
  }

  console.log('# slack');
  await probe(r, 'slack_list_channels (read)', apiKey, orgId, '/slack/channel/list', {
    method: 'GET',
    path: '/conversations.list',
    query: { limit: '5' },
  });
  await probe(r, 'slack_list_users (read)', apiKey, orgId, '/slack/user/list', {
    method: 'GET',
    path: '/users.list',
    query: { limit: '5' },
  });
  if (slackChan) {
    await probe(
      r,
      'slack_post_message (write)',
      apiKey,
      orgId,
      '/slack/message/post',
      {
        method: 'POST',
        path: '/chat.postMessage',
        body: { channel: slackChan, text: `Nomos dogfood probe ${new Date().toISOString()}` },
      },
      { channel: slackChan },
    );
    await probe(
      r,
      'slack_delete_message (cosigner)',
      apiKey,
      orgId,
      '/slack/message/delete',
      {
        method: 'POST',
        path: '/chat.delete',
        body: { channel: slackChan, ts: '0000000000.000000' },
      },
      { channel: slackChan },
      'deny-cosigner',
    );
  }

  r.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
