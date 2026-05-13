'use client';

import { useEffect, useState } from 'react';
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
import {
  deletePasskey,
  listPasskeys,
  type PasskeyRow as PasskeyClientRow,
  registerPasskey,
} from '../../../../lib/passkey-client';

type PasskeyRow = PasskeyClientRow;

export default function SecuritySettingsPage() {
  const [creds, setCreds] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await listPasskeys();
      setCreds(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to list passkeys');
      setCreds([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRegister() {
    try {
      setStatus('registering');
      setError(null);
      setInfo(null);
      await registerPasskey(name.trim().length > 0 ? { name: name.trim() } : undefined);
      setInfo('Passkey registered.');
      setName('');
      setStatus('done');
      await refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'enrollment failed');
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this passkey? You will need to register again from this device.')) return;
    try {
      await deletePasskey(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'remove failed');
    }
  }

  const hasNone = !loading && creds.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Passkeys</h1>
        <p className="text-sm text-zinc-500">
          Your passkeys sign you in to Nomos and approve step-up requests. We recommend enrolling at
          least two devices so you&rsquo;re never locked out.
        </p>
      </header>

      {hasNone ? (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-200">
              <strong>No passkey on file.</strong> Add one now so step-up approvals work and so you
              can sign in without a recovery code next time.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a passkey</CardTitle>
          <CardDescription>
            Uses your device&apos;s biometric (Touch ID / Face ID / Windows Hello) or a security
            key. The private key never leaves the device.
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
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : creds.length === 0 ? (
            <p className="text-sm text-zinc-500">No passkeys yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {creds.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.name ?? c.credentialID.slice(0, 12) + '…'}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500">
                      registered {new Date(c.createdAt).toLocaleString()}
                      {c.transports ? ` · ${c.transports}` : ''}
                      {c.deviceType ? ` · ${c.deviceType}` : ''}
                      {c.backedUp ? ' · synced' : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void handleRemove(c.id)}>
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
