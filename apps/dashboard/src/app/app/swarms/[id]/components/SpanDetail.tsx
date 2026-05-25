'use client';

import { Badge } from '../../../../../components/ui/badge';
import { trpc } from '../../../../../lib/trpc';
import { formatDate, shortId } from '../../../../../lib/utils';

export function SpanDetail({ spanId }: { spanId: string }) {
  const q = trpc.observability.spanDetail.useQuery({ spanId });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading span…</p>;
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>;
  const s = q.data;
  if (!s) return null;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <Badge
          variant={
            s.status === 'success' ? 'default' : s.status === 'denied' ? 'secondary' : 'destructive'
          }
          className="uppercase"
        >
          {s.status}
        </Badge>
        <code className="text-xs">{s.toolName}</code>
        {s.httpStatus ? (
          <span className="font-mono text-xs text-muted-foreground">HTTP {s.httpStatus}</span>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{s.latencyMs}ms</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Agent" value={s.agent?.name ?? '(unknown)'} mono />
        <Field label="Agent DID" value={shortId(s.agent?.did ?? '')} mono />
        <Field label="Receipt" value={shortId(s.receiptId)} mono />
        <Field label="Parent span" value={s.parentSpanId ? shortId(s.parentSpanId) : '—'} mono />
        <Field label="Started" value={formatDate(s.startedAt)} mono />
        <Field label="Ended" value={formatDate(s.endedAt)} mono />
      </div>

      {s.intent || s.nextAgentHint ? (
        <div className="space-y-1.5 rounded-md border border-aegis-iris/30 bg-aegis-iris/5 p-3">
          {s.intent ? (
            <div className="text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                intent
              </span>
              <p className="mt-0.5">{s.intent}</p>
            </div>
          ) : null}
          {s.nextAgentHint ? (
            <div className="text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                next step
              </span>
              <p className="mt-0.5">{s.nextAgentHint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {s.handoff ? (
        <div className="space-y-2 rounded-md border border-aegis-iris/40 bg-aegis-iris/10 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-aegis-iris">
            <span aria-hidden>→</span>
            <span>Handoff</span>
            <code className="ml-1 font-mono text-[11px] text-aegis-iris/80">
              {shortId(s.handoff.toAgentDid)}
            </code>
          </div>
          <div className="text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">task</span>
            <p className="mt-0.5 whitespace-pre-wrap">{s.handoff.task}</p>
          </div>
          {s.handoff.expectedOutput ? (
            <div className="text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                expected output
              </span>
              <p className="mt-0.5 whitespace-pre-wrap">{s.handoff.expectedOutput}</p>
            </div>
          ) : null}
          {s.handoff.rationale ? (
            <div className="text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                rationale
              </span>
              <p className="mt-0.5 whitespace-pre-wrap">{s.handoff.rationale}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {s.errorCode || s.errorMessage ? (
        <div className="rounded-md border border-aegis-coral/40 bg-aegis-coral/5 p-3">
          <div className="text-xs font-semibold text-aegis-coral">Error</div>
          <div className="mt-1 font-mono text-xs">
            {s.errorCode ? <div>code: {s.errorCode}</div> : null}
            {s.errorMessage ? <div>message: {s.errorMessage}</div> : null}
          </div>
        </div>
      ) : null}

      <Section title="Request">
        <Hash label="hash" value={s.requestArgsHash} />
        {s.requestSummary ? (
          <SummaryTable summary={s.requestSummary as Record<string, unknown>} />
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Response">
        {s.responseHash ? <Hash label="hash" value={s.responseHash} /> : null}
        {s.responseSummary ? (
          <SummaryTable summary={s.responseSummary as Record<string, unknown>} />
        ) : (
          <Empty />
        )}
      </Section>

      <p className="text-xs text-muted-foreground">
        Privacy: only sha256 hashes + an allowlisted summary are stored — never raw bodies.
      </p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${mono ? 'font-mono' : ''} text-xs`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <code className="truncate">{value}</code>
    </div>
  );
}

function SummaryTable({ summary }: { summary: Record<string, unknown> }) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return <Empty />;
  return (
    <div className="rounded-md border bg-muted/20 p-2 font-mono text-[11px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-muted-foreground">{k}:</span>
          <code className="truncate">{String(v)}</code>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground">No summary fields recorded.</p>;
}
