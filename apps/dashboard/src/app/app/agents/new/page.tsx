'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { trpc } from '../../../../lib/trpc';

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const create = trpc.agents.create.useMutation({
    onSuccess: (agent) => {
      utils.agents.list.invalidate();
      router.push(`/app/agents/${agent.id}?reveal=1`);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">
          Pick a memorable name. You can attach policies and mint UCANs after creation.
        </p>
      </header>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({ name });
          }}
        >
          <CardHeader>
            <CardTitle className="text-base">Agent details</CardTitle>
            <CardDescription>This name appears in audit logs and the registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="release-bot"
                required
                maxLength={100}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || name.length === 0}>
              {create.isPending ? 'Creating…' : 'Create agent'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
