'use client';

import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';

type SupportedIntegration = 'github' | 'slack' | 'google' | 'notion';
const SUPPORTED: readonly SupportedIntegration[] = ['github', 'slack', 'google', 'notion'];

function isSupported(id: string | null): id is SupportedIntegration {
  return id !== null && (SUPPORTED as readonly string[]).includes(id);
}

export interface PolicyTestPanelProps {
  policyId: string;
  integrationId: string | null;
}

interface DryRunResult {
  allow: boolean;
  reason?: string;
  receiptId: string;
  cedarText: string;
}

export function PolicyTestPanel({ policyId, integrationId }: PolicyTestPanelProps) {
  const integrationKnown = isSupported(integrationId);
  const actions = trpc.schemas.actionsFor.useQuery(
    integrationKnown ? { integrationId } : { integrationId: 'github' },
    { enabled: integrationKnown },
  );
  const dryRun = trpc.policies.dryRun.useMutation();

  const defaultCommand = actions.data?.[0]?.command ?? '';
  const [command, setCommand] = useState('');
  const [resourceText, setResourceText] = useState('{\n  "repo": "acme/billing"\n}');
  const [contextText, setContextText] = useState(() =>
    JSON.stringify({ now: new Date().toISOString(), agent_role: 'owner' }, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const effectiveCommand = command || defaultCommand;

  const buttonDisabled = useMemo(
    () => !effectiveCommand || dryRun.isPending,
    [effectiveCommand, dryRun.isPending],
  );

  function run() {
    let resource: Record<string, unknown>;
    let context: Record<string, unknown>;
    try {
      resource = JSON.parse(resourceText) as Record<string, unknown>;
    } catch (err) {
      setParseError(`Resource JSON: ${(err as Error).message}`);
      return;
    }
    try {
      context = JSON.parse(contextText) as Record<string, unknown>;
    } catch (err) {
      setParseError(`Context JSON: ${(err as Error).message}`);
      return;
    }
    setParseError(null);
    setRunError(null);
    setResult(null);
    setTraceOpen(false);
    dryRun.mutate(
      { policyId, command: effectiveCommand, resource, context },
      {
        onSuccess: (r) => setResult(r),
        onError: (err) => setRunError(err.message),
      },
    );
  }

  function reset() {
    setResult(null);
    setRunError(null);
    setTraceOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test panel</CardTitle>
        <CardDescription>
          Runs the same Cedar engine the PDP uses, scoped to this single policy. Nothing persists;
          no agent UCAN required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="test-command">Command</Label>
          {integrationKnown && (actions.data?.length ?? 0) > 0 ? (
            <Select
              id="test-command"
              value={effectiveCommand}
              onChange={(e) => setCommand(e.target.value)}
            >
              {actions.data?.map((a) => (
                <option key={a.command} value={a.command}>
                  {a.command}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="test-command"
              value={command}
              placeholder="/github/issue/create"
              onChange={(e) => setCommand(e.target.value)}
            />
          )}
          {!integrationKnown && (
            <p className="text-xs text-muted-foreground">
              No integration set on this policy — type the command manually.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="test-resource">Resource (JSON)</Label>
          <Textarea
            id="test-resource"
            rows={4}
            value={resourceText}
            onChange={(e) => setResourceText(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="test-context">Context (JSON)</Label>
          <Textarea
            id="test-context"
            rows={4}
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        {parseError && (
          <p className="text-sm text-destructive" role="alert" data-testid="test-parse-error">
            {parseError}
          </p>
        )}

        {runError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
            data-testid="test-run-error"
          >
            <p className="font-medium">PDP unreachable</p>
            <p className="mt-1 font-mono text-xs">{runError}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={run}>
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {!result && !runError && !parseError && !dryRun.isPending && (
          <p className="text-xs text-muted-foreground" data-testid="test-empty">
            Click Run to evaluate the request against this policy.
          </p>
        )}

        {result && (
          <div data-testid="test-result">
            {result.allow ? (
              <DecisionCard tone="allow">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
                <div className="flex-1">
                  <p className="text-2xl font-semibold tracking-tight">ALLOW</p>
                  <p className="font-mono text-xs opacity-80">receipt {result.receiptId}</p>
                </div>
              </DecisionCard>
            ) : (
              <DecisionCard tone="deny">
                <XCircle className="h-6 w-6" aria-hidden />
                <div className="flex-1">
                  <p className="text-2xl font-semibold tracking-tight">DENY</p>
                  {result.reason && (
                    <p className="font-mono text-xs opacity-80">reason: {result.reason}</p>
                  )}
                  <p className="font-mono text-xs opacity-60">receipt {result.receiptId}</p>
                </div>
              </DecisionCard>
            )}

            <button
              type="button"
              onClick={() => setTraceOpen((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid="test-trace-toggle"
            >
              {traceOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {traceOpen ? 'Hide' : 'Show'} policy Cedar
            </button>
            {traceOpen && (
              <pre
                className="mt-2 max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed"
                data-testid="test-trace"
              >
                {result.cedarText}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {result && (
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          )}
          <Button onClick={run} disabled={buttonDisabled}>
            {dryRun.isPending ? 'Running decision…' : result ? 'Re-run' : 'Run'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface DecisionCardProps {
  tone: 'allow' | 'deny';
  children: React.ReactNode;
}

function DecisionCard({ tone, children }: DecisionCardProps) {
  const cls =
    tone === 'allow'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100'
      : 'border-destructive/40 bg-destructive/5 text-destructive';
  return <div className={`flex items-center gap-3 rounded-md border p-4 ${cls}`}>{children}</div>;
}
