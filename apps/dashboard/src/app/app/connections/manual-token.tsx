'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import type { ConnectorId } from '../../../lib/oauth';
import { trpc } from '../../../lib/trpc';

const ALL_CONNECTORS: { id: ConnectorId; label: string; hint: string }[] = [
  { id: 'github', label: 'GitHub', hint: 'Personal Access Token (classic or fine-grained)' },
  { id: 'slack', label: 'Slack', hint: 'Bot User OAuth Token (xoxb-...) or User Token' },
  { id: 'google', label: 'Google', hint: 'OAuth access token (covers Drive, Calendar by scope)' },
  { id: 'google_gmail', label: 'Gmail', hint: 'OAuth token with gmail.* scopes' },
  { id: 'google_calendar', label: 'Google Calendar', hint: 'OAuth token with calendar.* scopes' },
  { id: 'google_drive', label: 'Google Drive', hint: 'OAuth token with drive.* scopes' },
  { id: 'google_contacts', label: 'Google Contacts', hint: 'OAuth token with contacts.readonly' },
  { id: 'notion', label: 'Notion', hint: 'Internal Integration Secret' },
  { id: 'linear', label: 'Linear', hint: 'Personal API key (lin_api_...)' },
  { id: 'stripe', label: 'Stripe', hint: 'Restricted key (rk_...) or secret key' },
  { id: 'telegram', label: 'Telegram', hint: 'Bot token from @BotFather' },
  { id: 'dropbox', label: 'Dropbox', hint: 'Generated access token' },
  { id: 'twilio', label: 'Twilio', hint: 'Account SID:Auth Token (basic auth)' },
  { id: 'granola', label: 'Granola', hint: 'API key from Settings → API' },
  { id: 'perplexity', label: 'Perplexity', hint: 'API key (pplx-...)' },
  { id: 'jira', label: 'Jira', hint: 'API token + email (Atlassian)' },
  { id: 'salesforce', label: 'Salesforce', hint: 'OAuth access token + instance URL' },
];

export function ManualTokenForm({ onAdded }: { onAdded?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [connector, setConnector] = useState<ConnectorId>('github');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [scopes, setScopes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const add = trpc.oauth.addManual.useMutation({
    onSuccess: () => {
      utils.oauth.list.invalidate();
      setAccessToken('');
      setRefreshToken('');
      setAccountId('');
      setScopes('');
      setError(null);
      setOpen(false);
      onAdded?.();
    },
    onError: (e) => setError(e.message),
  });

  if (!open) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Add a token manually</CardTitle>
          <CardDescription>
            Already have a token? Paste it here. Useful for SSO-blocked OAuth flows or API-key
            integrations (Granola, Perplexity, Twilio, Telegram, Jira, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setOpen(true)}>Paste a token</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual token</CardTitle>
        <CardDescription>
          Encrypted at rest with our customer-master key. Revoke by removing the row in the table
          below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Provider</span>
            <select
              value={connector}
              onChange={(e) => setConnector(e.target.value as ConnectorId)}
              className="block w-full rounded border border-aegis-line bg-aegis-bg-2 p-2 text-sm"
            >
              {ALL_CONNECTORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-aegis-mute">
              {ALL_CONNECTORS.find((c) => c.id === connector)?.hint}
            </p>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Account label</span>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="e.g. acme-prod, my-handle"
              className="block w-full rounded border border-aegis-line bg-aegis-bg-2 p-2 text-sm"
            />
            <p className="text-xs text-aegis-mute">
              Free-text label so you can tell connections apart in the table.
            </p>
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Access token</span>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="ghp_… / xoxb-… / lin_api_… / pplx-…"
            className="block w-full rounded border border-aegis-line bg-aegis-bg-2 p-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Refresh token (optional)</span>
          <input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="leave blank if non-refreshable"
            className="block w-full rounded border border-aegis-line bg-aegis-bg-2 p-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Scopes (comma- or space-separated)</span>
          <input
            type="text"
            value={scopes}
            onChange={(e) => setScopes(e.target.value)}
            placeholder="repo, read:user"
            className="block w-full rounded border border-aegis-line bg-aegis-bg-2 p-2 text-xs"
          />
        </label>

        {error && (
          <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            disabled={!accountId || !accessToken || add.isPending}
            onClick={() => {
              const scopesArr = scopes
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              add.mutate({
                connector,
                accountId,
                accessToken,
                refreshToken: refreshToken || undefined,
                scopes: scopesArr,
              });
            }}
          >
            {add.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
