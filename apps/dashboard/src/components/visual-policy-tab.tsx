'use client';

import { emitPolicySet, type VisualPolicy } from '@auto-nomos/policy-builder/browser';
import { PolicyBuilder } from '@auto-nomos/policy-builder/components';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

export interface VisualPolicyTabProps {
  cedarText: string;
  /** Called when the user applies a structurally-changed IR back to Cedar. */
  onApply: (newCedarText: string) => void;
  /** Disables editing — used for read-only previews. */
  readOnly?: boolean;
}

export function VisualPolicyTab({ cedarText, onApply, readOnly = false }: VisualPolicyTabProps) {
  // Cedar → IR runs server-side because cedar-wasm is Node-only.
  // Debounce the input the same way the Cedar tab debounces preview parses.
  const [debouncedText, setDebouncedText] = useState(cedarText);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(cedarText), 250);
    return () => clearTimeout(t);
  }, [cedarText]);

  const parsed = trpc.policies.parseToIr.useQuery(
    { cedarText: debouncedText || ' ' },
    { enabled: debouncedText.length > 0 },
  );
  // The existing `preview` query validates emitted Cedar at save time —
  // we fetch it imperatively so it doesn't cache against a single argument.
  const utils = trpc.useUtils();

  const [policies, setPolicies] = useState<VisualPolicy[]>([]);
  const [unrepresentable, setUnrepresentable] = useState<{ reason: string; cedar: string }[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Re-sync when the server's parse result lands.
  useEffect(() => {
    if (!parsed.data) return;
    setPolicies(parsed.data.policies as VisualPolicy[]);
    setUnrepresentable(parsed.data.unrepresentable ?? []);
    setDirty(false);
    setValidationError(null);
  }, [parsed.data]);

  const allUnrepresentable = policies.length === 0 && unrepresentable.length > 0;

  function update(idx: number, next: VisualPolicy) {
    setPolicies((cur) => cur.map((p, i) => (i === idx ? next : p)));
    setDirty(true);
  }

  async function applyToCedar() {
    const cedar = emitPolicySet(policies);
    const check = await utils.policies.preview.fetch({ cedarText: cedar });
    if (!check.ok) {
      setValidationError(
        typeof check.errors[0] === 'string'
          ? check.errors[0]
          : ((check.errors[0] as { message?: string } | undefined)?.message ??
              'emitted Cedar failed to re-parse'),
      );
      return;
    }
    setValidationError(null);
    onApply(cedar);
    setDirty(false);
  }

  function discard() {
    if (!parsed.data) return;
    setPolicies(parsed.data.policies as VisualPolicy[]);
    setUnrepresentable(parsed.data.unrepresentable ?? []);
    setDirty(false);
    setValidationError(null);
  }

  if (parsed.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visual builder</CardTitle>
          <CardDescription>Parsing…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visual builder</CardTitle>
        <CardDescription>
          {allUnrepresentable ? (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <XCircle className="h-3.5 w-3.5" /> This policy uses shapes the visual builder
              doesn&rsquo;t model — edit it in Cedar.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {policies.length} polic
              {policies.length === 1 ? 'y' : 'ies'} loaded
              {unrepresentable.length > 0 ? `, ${unrepresentable.length} skipped` : ''}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {policies.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing to render visually. Switch to the Cedar tab to keep editing.
          </p>
        ) : (
          policies.map((p, i) => (
            <div
              key={p.id}
              className="rounded-md border bg-card overflow-hidden"
              data-testid={`visual-policy-${i}`}
            >
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                <span className="font-medium">Policy #{i + 1}</span>
                <span className="font-mono text-muted-foreground">{p.effect}</span>
              </div>
              <PolicyBuilder policy={p} onChange={(next) => update(i, next)} readOnly={readOnly} />
            </div>
          ))
        )}

        {unrepresentable.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">
              {unrepresentable.length} polic
              {unrepresentable.length === 1 ? 'y' : 'ies'} skipped:
            </p>
            <ul className="mt-1 list-disc pl-5 font-mono">
              {unrepresentable.map((u, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional reasons are stable
                <li key={i}>{u.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {validationError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            Visual edit produced invalid Cedar: {validationError}
          </div>
        )}
      </CardContent>
      {!readOnly && (
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={discard} disabled={!dirty}>
            Discard
          </Button>
          <Button onClick={applyToCedar} disabled={!dirty}>
            Apply to Cedar
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
