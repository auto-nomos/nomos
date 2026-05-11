'use client';

import { PACKS, type PolicyTemplate, templatesFor } from '@auto-nomos/schema-packs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PolicyEditor } from '../../../../components/policy-editor';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { trpc } from '../../../../lib/trpc';

const STARTER = `permit (
  principal,
  action == Action::"/github/user/read",
  resource
);`;

export default function NewPolicyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState<string>('general');
  const [templateId, setTemplateId] = useState<string>('');
  const [text, setText] = useState(STARTER);
  const [error, setError] = useState<string | null>(null);

  const schemas = trpc.schemas.list.useQuery();
  const utils = trpc.useUtils();
  const upsert = trpc.policies.upsert.useMutation({
    onSuccess: (p) => {
      utils.policies.list.invalidate();
      router.push(`/app/policies/${p.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const integrationTemplates: PolicyTemplate[] =
    integrationId === 'general'
      ? []
      : templatesFor(integrationId as 'github' | 'slack' | 'google' | 'notion');

  function selectTemplate(id: string) {
    setTemplateId(id);
    const t = integrationTemplates.find((x) => x.id === id);
    if (t) {
      setText(t.cedarText);
      if (!name) setName(t.name);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New policy</h1>
        <p className="text-sm text-muted-foreground">
          Pick a template to get started or paste raw Cedar. Save validates server-side.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
          <CardDescription>Pick an integration scope and a memorable name.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="github-issues-read-only"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="integration">Integration</Label>
            <Select
              id="integration"
              value={integrationId}
              onChange={(e) => {
                setIntegrationId(e.target.value);
                setTemplateId('');
              }}
            >
              <option value="general">General</option>
              {PACKS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {schemas.data
                ?.filter((s) => !PACKS.some((p) => p.id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {integrationTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>
              Five starter policies for {integrationId}. Selecting a template fills the editor below
              — you can always tweak from there.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integrationTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className={`text-left rounded-md border p-3 transition hover:bg-muted ${templateId === t.id ? 'border-primary bg-muted' : ''}`}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                {!t.visualReady && (
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Cedar-only (visual builder cannot render)
                  </p>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cedar text</CardTitle>
          <CardDescription>Edit then save. Save will reject unparseable Cedar.</CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyEditor value={text} onChange={setText} />
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              upsert.mutate({
                name,
                cedarText: text,
                integrationId: integrationId === 'general' ? undefined : integrationId,
              })
            }
            disabled={upsert.isPending || !name || !text}
          >
            {upsert.isPending ? 'Saving…' : 'Create policy'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
