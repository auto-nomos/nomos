'use client';

import { Badge } from '../../../../../components/ui/badge';
import { trpc } from '../../../../../lib/trpc';

export function CapVsActDiff({ agentId }: { agentId: string }) {
  const q = trpc.observability.capabilityDiff.useQuery({ agentId, windowDays: 7 });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Parsing policies…</p>;
  }
  if (q.error) {
    return <p className="text-sm text-destructive">{q.error.message}</p>;
  }
  const d = q.data;
  if (!d) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-xs">
        <Stat label="Mapped policies" value={d.policyCount.toString()} />
        <Stat
          label="Can do (commands)"
          value={d.wildcardCapability ? 'ANY' : d.canCommands.length.toString()}
        />
        <Stat label="Did do (7d)" value={d.didCommands.length.toString()} />
      </div>

      <Section
        title="Out of policy"
        tone="destructive"
        empty="None — every command observed is permitted by mapped policies."
      >
        {d.outOfPolicy.map((c) => (
          <Badge key={c} variant="destructive" className="font-mono text-xs">
            {c}
          </Badge>
        ))}
      </Section>

      <Section
        title="Unused capability"
        tone="muted"
        empty="Every permitted command was used in the window."
      >
        {d.unusedCapabilities.map((c) => (
          <Badge key={c} variant="outline" className="font-mono text-xs">
            {c}
          </Badge>
        ))}
      </Section>

      <Section title="Active commands" tone="muted" empty="No audit events in the window.">
        {d.didCommands.map((c) => {
          const ct = d.didCommandCounts[c] ?? 0;
          return (
            <Badge key={c} variant="secondary" className="font-mono text-xs">
              {c} · {ct}
            </Badge>
          );
        })}
      </Section>

      {d.unrepresentablePolicies.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {d.unrepresentablePolicies.length} polic
          {d.unrepresentablePolicies.length === 1 ? 'y' : 'ies'} could not be parsed into the visual
          IR — capability set may be incomplete.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg tabular-nums">{value}</div>
    </div>
  );
}

function Section({
  title,
  tone,
  empty,
  children,
}: {
  title: string;
  tone: 'destructive' | 'muted';
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <div
        className={`mb-2 text-xs font-semibold ${tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {title}
      </div>
      {hasItems ? (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
