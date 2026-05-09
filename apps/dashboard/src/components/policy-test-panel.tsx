'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
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
  const [result, setResult] = useState<DryRunResult | null>(null);

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
    setResult(null);
    dryRun.mutate(
      { policyId, command: effectiveCommand, resource, context },
      {
        onSuccess: (r) => setResult(r),
        onError: (err) => setParseError(err.message),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test panel</CardTitle>
        <CardDescription>
          Evaluate this policy against a synthetic authorize request. Nothing is persisted; the PDP
          is not contacted.
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
          <p className="text-sm text-destructive" role="alert">
            {parseError}
          </p>
        )}

        {result &&
          (result.allow ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">ALLOW</span>
              <span className="font-mono text-xs">receipt {result.receiptId.slice(0, 16)}…</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              <span className="font-medium">DENY</span>
              {result.reason && <span className="font-mono text-xs">{result.reason}</span>}
            </div>
          ))}

        <div className="flex justify-end">
          <Button onClick={run} disabled={buttonDisabled}>
            {dryRun.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
