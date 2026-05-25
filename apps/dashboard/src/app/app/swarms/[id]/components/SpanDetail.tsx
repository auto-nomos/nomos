'use client';

import type { HandoffMatch, HandoffMatchStatus } from '@auto-nomos/shared-types';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import { trpc } from '../../../../../lib/trpc';
import { usePermissions } from '../../../../../lib/use-permissions';
import { formatDate, shortId } from '../../../../../lib/utils';

export function SpanDetail({
  spanId,
  match = null,
}: {
  spanId: string;
  match?: HandoffMatch | null;
}) {
  const q = trpc.observability.spanDetail.useQuery({ spanId });
  const { can } = usePermissions();
  const canReadPrompt = can('prompts', 'read');

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading span…</p>;
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>;
  const s = q.data;
  if (!s) return null;

  return (
    <Tabs defaultValue="summary" className="text-sm">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        {canReadPrompt ? <TabsTrigger value="prompt">Prompt</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="summary" className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              s.status === 'success'
                ? 'default'
                : s.status === 'denied'
                  ? 'secondary'
                  : 'destructive'
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
              {match ? <MatchBadge match={match} /> : null}
            </div>
            <div className="text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                task
              </span>
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
      </TabsContent>
      {canReadPrompt ? (
        <TabsContent value="prompt" className="space-y-3">
          <PromptTab spanId={spanId} />
        </TabsContent>
      ) : null}
    </Tabs>
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

function PromptTab({ spanId }: { spanId: string }) {
  const { can } = usePermissions();
  const [showRaw, setShowRaw] = useState(false);
  const canRaw = can('prompts_raw', 'read');
  const redacted = trpc.observability.promptDetail.useQuery({ spanId });
  const raw = trpc.observability.promptRawDetail.useQuery(
    { spanId },
    { enabled: showRaw && canRaw },
  );
  const detail = showRaw && raw.data ? raw.data : redacted.data;
  const err = showRaw ? raw.error : redacted.error;
  const loading = (showRaw ? raw.isLoading : redacted.isLoading) === true;

  if (loading) return <p className="text-xs text-muted-foreground">Loading prompt…</p>;
  if (err)
    return (
      <p className="text-xs text-destructive">
        {err.data?.code === 'NOT_FOUND'
          ? 'No prompt captured for this span (capture may be disabled).'
          : err.message}
      </p>
    );
  if (!detail) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Captured</span>
          <code className="font-mono text-[11px] text-muted-foreground">
            {formatDate(detail.createdAt)} · {detail.kmsKeyId}
          </code>
          {detail.raw ? (
            <span className="rounded-full border border-aegis-coral/50 bg-aegis-coral/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-aegis-coral">
              raw — read audit-logged
            </span>
          ) : null}
        </div>
        {canRaw ? (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-accent"
          >
            <Eye className="h-3 w-3" aria-hidden />
            {showRaw ? 'redacted' : 'show raw'}
          </button>
        ) : null}
      </div>
      {detail.redactionFindings ? <FindingsRow findings={detail.redactionFindings} /> : null}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          prompt
        </div>
        <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 font-mono text-[11px]">
          {detail.promptText}
        </pre>
      </div>
      {detail.reasoningText ? (
        <details className="rounded-md border bg-muted/20">
          <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            reasoning ({detail.reasoningText.length} chars)
          </summary>
          <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px]">
            {detail.reasoningText}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function FindingsRow({
  findings,
}: {
  findings: NonNullable<{
    bearer_token: number;
    credit_card: number;
    ssn: number;
    email: number;
    phone: number;
  }>;
}) {
  const items: [string, number][] = Object.entries(findings).filter(([, n]) => n > 0) as [
    string,
    number,
  ][];
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="text-muted-foreground">redacted:</span>
      {items.map(([k, n]) => (
        <span
          key={k}
          className="rounded-full border border-aegis-amber/50 bg-aegis-amber/10 px-1.5 py-0.5 text-aegis-amber"
        >
          {n}× {k.replace('_', ' ')}
        </span>
      ))}
    </div>
  );
}

function MatchBadge({ match }: { match: HandoffMatch }) {
  const label = match.status === 'matched' ? 'matched' : match.status.replace('_', ' ');
  const tone: Record<HandoffMatchStatus, string> = {
    matched: 'border-aegis-signal/50 bg-aegis-signal/10 text-aegis-signal',
    wrong_agent: 'border-aegis-coral/50 bg-aegis-coral/10 text-aegis-coral',
    missing: 'border-aegis-coral/50 bg-aegis-coral/10 text-aegis-coral',
    late: 'border-aegis-amber/50 bg-aegis-amber/10 text-aegis-amber',
  };
  const title =
    match.status === 'matched'
      ? `child arrived in window (${match.latencyMs}ms after parent)`
      : match.status === 'wrong_agent'
        ? `expected ${shortId(match.declaredToDid)} · got ${shortId(match.actualAgentDid ?? '?')}`
        : match.status === 'late'
          ? `arrived ${Math.round((match.latencyMs ?? 0) / 1000)}s after the 5-min window`
          : 'no child agent ever authorized — fork never happened';
  return (
    <span
      title={title}
      className={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone[match.status]}`}
    >
      {label}
    </span>
  );
}
