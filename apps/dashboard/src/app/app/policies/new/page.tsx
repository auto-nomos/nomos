'use client';

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
  action,
  resource
);`;

export default function NewPolicyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState('general');
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New policy</h1>
        <p className="text-sm text-muted-foreground">
          Cedar text is validated server-side before saving.
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
              onChange={(e) => setIntegrationId(e.target.value)}
            >
              <option value="general">General</option>
              {schemas.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

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
