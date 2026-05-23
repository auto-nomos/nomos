import { PaneShell, PathTabs } from '../path-tabs';

export function StepCall() {
  return (
    <section id="step-4" className="border-b border-aegis-line bg-aegis-surface/20 scroll-mt-24">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">step 04</div>
          <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper md:text-[56px]">
            Trigger <em>your first call</em>.
          </h2>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-aegis-mute md:text-base">
            Authorize gives you a UCAN. Hand that UCAN to the PDP and it makes the real GitHub call
            on your behalf. Your agent never holds the OAuth token — every step lands in the audit
            chain.
          </p>
          <AuditChainArtifact />
        </div>
        <div className="col-span-12 lg:col-span-7">
          <PathTabs
            panes={{
              cli: (
                <PaneShell caption="authorize → proxy — two calls, hash-chained">
                  {`cb authorize \\
  --command /github/issue/list \\
  --resource provider=github,owner=acme,repo=app \\
  --ttl 300
# → { decision: 'allow', ucan, receiptId }

cb proxy GET /github/issue/list \\
  --query owner=acme --query repo=app \\
  --ucan eyJ…
# → real GitHub response`}
                </PaneShell>
              ),
              mcp: (
                <PaneShell caption="natural-language prompt — server handles auth + proxy">
                  {`> List the open issues on acme/app via Nomos.

Server calls /v1/authorize for
/github/issue/list, receives a UCAN, makes
the upstream call against the PDP, and
returns the issues array. Two new rows in
the audit chain.`}
                </PaneShell>
              ),
              sdk: (
                <PaneShell caption="authorize + fetch — same two HTTP calls, less plumbing">
                  {`const grant = await client.authorize({
  command: '/github/issue/list',
  resource: { provider: 'github', owner: 'acme', repo: 'app' },
  ttlSeconds: 300,
});

if (grant.decision !== 'allow') {
  throw new Error(grant.reason);
}

const issues = await fetch(
  \`\${process.env.NOMOS_PDP_URL}/github/issue/list\` +
    \`?owner=acme&repo=app\`,
  { headers: { authorization: \`Bearer \${grant.ucan}\` } },
).then((r) => r.json());`}
                </PaneShell>
              ),
            }}
          />
        </div>
      </div>
    </section>
  );
}

function AuditChainArtifact() {
  const rows: { ts: string; act: string; cmd: string; hash: string; tone: 'signal' | 'mute' }[] = [
    {
      ts: '14:22:11',
      act: 'allow',
      cmd: '/github/issue/list (proxy)',
      hash: 'ae71…1c7b',
      tone: 'signal',
    },
    {
      ts: '14:22:10',
      act: 'allow',
      cmd: '/github/issue/list (authorize)',
      hash: '1c7b…09f4',
      tone: 'signal',
    },
    {
      ts: '14:22:09',
      act: 'init',
      cmd: 'app.created · Inbox triage bot',
      hash: '09f4…0000',
      tone: 'mute',
    },
  ];
  return (
    <div className="mt-7 rounded-sm border border-aegis-line bg-aegis-ink p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          /app/audit · receipts after step 04
        </div>
        <span className="font-mono text-[10px] text-aegis-signal">↪ chained</span>
      </div>
      <ul className="divide-y divide-aegis-line/60 font-mono text-[11px]">
        {rows.map((r) => (
          <li
            key={r.hash}
            className="grid grid-cols-[64px_44px_1fr_88px] items-center gap-3 py-2.5"
          >
            <span className="text-aegis-faint">{r.ts}</span>
            <span className={r.tone === 'signal' ? 'text-aegis-signal' : 'text-aegis-mute'}>
              {r.act}
            </span>
            <span className="truncate text-aegis-paper">{r.cmd}</span>
            <span className="text-right text-aegis-faint">{r.hash}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-aegis-line pt-3 text-[11px] text-aegis-mute">
        Every row links to the row above via{' '}
        <code className="font-mono text-aegis-paper">prevHash</code>. Daily roots are Ed25519-signed
        and replayable via{' '}
        <code className="font-mono text-aegis-paper">@auto-nomos/audit-verify</code>.
      </div>
    </div>
  );
}
