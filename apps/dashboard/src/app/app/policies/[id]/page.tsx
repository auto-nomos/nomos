'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { PolicyEditor } from '../../../../components/policy-editor';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { trpc } from '../../../../lib/trpc';
import { formatDate } from '../../../../lib/utils';

export default function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const policy = trpc.policies.get.useQuery({ id });
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (policy.data) {
      setName(policy.data.name);
      setText(policy.data.cedarText);
      setDirty(false);
    }
  }, [policy.data]);

  const upsert = trpc.policies.upsert.useMutation({
    onSuccess: () => {
      utils.policies.get.invalidate({ id });
      utils.policies.list.invalidate();
      setDirty(false);
      setSaveError(null);
    },
    onError: (err) => setSaveError(err.message),
  });

  // Live preview (debounced server-side parse)
  const [debouncedText, setDebouncedText] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  const preview = trpc.policies.preview.useQuery(
    { cedarText: debouncedText || ' ' },
    { enabled: debouncedText.length > 0 },
  );

  if (policy.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!policy.data) return <p className="text-sm">Policy not found.</p>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Policy</p>
          <h1 className="text-2xl font-semibold tracking-tight">{policy.data.name}</h1>
          <p className="text-xs text-muted-foreground">
            Updated {formatDate(policy.data.updatedAt)}
            {policy.data.integrationId ? ` · ${policy.data.integrationId}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push('/app/policies')}>
            Back
          </Button>
          <Button
            onClick={() => upsert.mutate({ id, name, cedarText: text })}
            disabled={!dirty || upsert.isPending || !preview.data?.ok}
          >
            {upsert.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
          <CardDescription>Rename without breaking PDP cache.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              maxLength={200}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="cedar">
        <TabsList>
          <TabsTrigger value="cedar">Cedar</TabsTrigger>
          <TabsTrigger value="visual" disabled>
            Visual (S7)
          </TabsTrigger>
          <TabsTrigger value="test">Test policy</TabsTrigger>
        </TabsList>

        <TabsContent value="cedar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Editor</CardTitle>
              <CardDescription>
                {preview.data?.ok ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Cedar valid
                  </span>
                ) : preview.data ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    {errorMessage(preview.data.errors[0]) ?? 'invalid'}
                  </span>
                ) : (
                  '—'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PolicyEditor
                value={text}
                onChange={(t) => {
                  setText(t);
                  setDirty(true);
                }}
              />
              {saveError ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {saveError}
                </p>
              ) : null}
              {preview.data && !preview.data.ok ? (
                <ul className="mt-3 space-y-1 text-xs text-destructive">
                  {preview.data.errors.map((e, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cedar errors are positional
                    <li key={i} className="font-mono">
                      {errorMessage(e)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <PolicyTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (
    e &&
    typeof e === 'object' &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return 'unknown error';
}

function PolicyTestPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test panel</CardTitle>
        <CardDescription>
          Forms a deterministic authorize request and runs Cedar against it. Wired in 6.4 follow-up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The full test-against-PDP flow lands with the schema-pack work in Sprint 10. Today the
          editor's live validation already catches the common case (parse errors). Authorize-style
          dry runs will appear here once schemas + sample contexts are reachable from the dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
