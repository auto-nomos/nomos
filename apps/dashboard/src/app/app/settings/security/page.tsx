'use client';

import { type RegistrationResponseJSON, startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
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
import { trpc } from '../../../../lib/trpc';

export default function SecuritySettingsPage() {
  const utils = trpc.useUtils();
  const list = trpc.stepup.listCredentials.useQuery();
  const registerOptions = trpc.stepup.registerOptions.useMutation();
  const registerVerify = trpc.stepup.registerVerify.useMutation();
  const removeCredential = trpc.stepup.removeCredential.useMutation({
    onSuccess: () => utils.stepup.listCredentials.invalidate(),
  });

  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleRegister() {
    try {
      setStatus('registering');
      setError(null);
      setInfo(null);
      const opts = await registerOptions.mutateAsync();
      const response = (await startRegistration({ optionsJSON: opts })) as RegistrationResponseJSON;
      // biome-ignore lint/suspicious/noExplicitAny: WebAuthn JSON validated server-side.
      const body: { response: any; name?: string } = { response: response as any };
      if (name.trim().length > 0) body.name = name.trim();
      await registerVerify.mutateAsync(body);
      setInfo('Passkey registered.');
      setName('');
      setStatus('done');
      await list.refetch();
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  const creds = list.data ?? [];
  const hasNone = !list.isLoading && creds.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Passkeys</h1>
        <p className="text-sm text-zinc-500">
          Register a passkey on this device to approve step-up requests from the dashboard. Without
          a passkey you cannot approve high-risk actions from the dashboard — only via the Telegram
          bot.
        </p>
      </header>

      {hasNone ? (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-200">
              <strong>No passkey on file.</strong> Register one before your first agent step-up so
              the approval flow works without a Telegram fallback.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a passkey</CardTitle>
          <CardDescription>
            Uses your device&apos;s biometric (Touch ID / Face ID / Windows Hello) or a security
            key. Stored as a credential bound to your user — no shared secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="passkey-name" className="text-xs text-zinc-500">
              Label (optional)
            </Label>
            <Input
              id="passkey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MacBook Touch ID"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleRegister} disabled={status === 'registering'}>
              {status === 'registering' ? 'Registering…' : 'Register passkey'}
            </Button>
            {info ? <span className="text-xs text-green-600">{info}</span> : null}
            {error ? <span className="text-xs text-red-600">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered passkeys</CardTitle>
          <CardDescription>
            Each passkey is tied to a single device. Remove old ones if you lose access to the
            device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : creds.length === 0 ? (
            <p className="text-sm text-zinc-500">No passkeys yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {creds.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.name ?? c.credentialId.slice(0, 12) + '…'}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500">
                      registered {new Date(c.createdAt).toLocaleString()}
                      {c.lastUsedAt
                        ? ` · last used ${new Date(c.lastUsedAt).toLocaleString()}`
                        : ' · never used'}
                      {c.transports ? ` · ${c.transports}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Remove this passkey? You will need to register again.')) return;
                      await removeCredential.mutateAsync({ id: c.id });
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
