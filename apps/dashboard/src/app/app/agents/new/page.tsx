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
  const [requireApproval, setRequireApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const create = trpc.agents.create.useMutation({
    onSuccess: (agent) => {
      utils.agents.list.invalidate();
      utils.agents.pendingConnections.invalidate();
      router.push(`/app/agents/${agent.id}?reveal=1`);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Register an App</h1>
        <p className="text-sm text-muted-foreground">
          Pick a memorable name. You can attach policies and mint authorization grants after
          creation.
        </p>
      </header>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({ name, requireApproval });
          }}
        >
          <CardHeader>
            <CardTitle className="text-base">App details</CardTitle>
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
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="space-y-0.5">
                <span className="block font-medium text-foreground">
                  Require first-connection approval
                </span>
                <span className="block text-xs text-muted-foreground">
                  Agent is registered but cannot mint UCANs until you approve it from the Pending
                  connections panel. Use this when an autonomous CLI registers an agent on your
                  behalf and you want a human check before activation.
                </span>
              </span>
            </label>
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
              {create.isPending ? 'Creating…' : 'Register App'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
