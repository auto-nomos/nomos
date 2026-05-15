'use client';

import { Copy, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { AgentAuditPanel } from '../../../../components/agent-audit-panel';
import { AgentPoliciesCard } from '../../../../components/agent-policies-card';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { formatEnvelopeAsk } from '../../../../lib/format-envelope';
import { trpc } from '../../../../lib/trpc';
import { formatDate, shortId } from '../../../../lib/utils';
import { ActionGraph } from '../../swarms/[id]/components/ActionGraph';
import { ActionTimeline } from '../../swarms/[id]/components/ActionTimeline';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const list = trpc.agents.list.useQuery();
  const agent = list.data?.find((a) => a.id === id);

  const apiKeys = trpc.apiKeys.list.useQuery({ agentId: id });
  const envelopes = trpc.envelopes.list.useQuery({ agentId: id });
  const grants = trpc.grants.list.useQuery({ agentId: id });
  const audit = trpc.audit.list.useQuery({ agent: agent?.did, limit: 50 }, { enabled: !!agent });

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('default');
  const [keyRole, setKeyRole] = useState<
    'owner' | 'admin' | 'agent_manager' | 'policy_author' | 'auditor' | 'member'
  >('admin');
  const [issueOpen, setIssueOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createKey = trpc.apiKeys.create.useMutation({
    onSuccess: (k) => {
      utils.apiKeys.list.invalidate({ agentId: id });
      setRevealedKey(k.plaintextOnce);
      setIssueOpen(false);
    },
  });
  const revokeKey = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => utils.apiKeys.list.invalidate({ agentId: id }),
  });
  const deleteAgent = trpc.agents.delete.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate();
      router.push('/app/agents');
    },
  });
  const setMode = trpc.agents.setMode.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  });
  const revokeEnvelope = trpc.envelopes.revoke.useMutation({
    onSuccess: () => utils.envelopes.list.invalidate({ agentId: id }),
  });
  const revokeGrant = trpc.grants.revoke.useMutation({
    onSuccess: () => utils.grants.list.invalidate({ agentId: id }),
  });
  const toggleGrant = trpc.grants.toggle.useMutation({
    onSuccess: () => utils.grants.list.invalidate({ agentId: id }),
  });

  useEffect(() => {
    // If we arrive with ?reveal=1 right after creation, auto-issue an initial key
    if (
      searchParams?.get('reveal') === '1' &&
      agent &&
      apiKeys.data?.length === 0 &&
      !createKey.isPending &&
      !revealedKey
    ) {
      createKey.mutate({ agentId: id, name: 'default' });
    }
    // Once we've consumed reveal, strip it from the URL so refresh doesn't loop.
    if (searchParams?.get('reveal') === '1' && revealedKey) {
      router.replace(`/app/agents/${id}`);
    }
  }, [agent, apiKeys.data, createKey, id, revealedKey, router, searchParams]);

  if (list.isPending) {
    return <p className="text-sm text-muted-foreground">Loading App…</p>;
  }
  if (!agent) {
    return <p className="text-sm">App not found.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">App</p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/agents/${id}/grants`)}
          >
            Granted permissions →
          </Button>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{agent.did}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> API keys · Connected clients
            </CardTitle>
            <CardDescription>
              Plaintext is shown ONCE. The hash is stored; we cannot recover the secret. Each row
              tracks the MCP client (Cursor / Claude Code / Codex) that last used the key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apiKeys.data && apiKeys.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.data.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{k.role}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {k.prefix.slice(0, 20)}…
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'never'}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {k.lastUserAgent ? k.lastUserAgent.slice(0, 40) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {k.lastHost ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {k.revokedAt ? (
                          <Badge variant="destructive">revoked</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revokeKey.mutate({ id: k.id })}
                            disabled={revokeKey.isPending}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No keys yet.</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => setIssueOpen(true)} size="sm">
              Issue new key
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
            <CardDescription>Operational metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status">
              <Badge
                variant={
                  agent.status === 'active'
                    ? 'success'
                    : agent.status === 'disabled'
                      ? 'warning'
                      : 'destructive'
                }
              >
                {agent.status}
              </Badge>
            </Row>
            <Row label="Created">{formatDate(agent.createdAt)}</Row>
            <Row label="Last active">
              {agent.lastActiveAt ? formatDate(agent.lastActiveAt) : '—'}
            </Row>
            <Row label="DID">
              <span className="font-mono text-xs">{shortId(agent.did, 16, 6)}</span>
            </Row>
            <Row label="Mode">
              <div className="flex items-center gap-2">
                <Badge variant={agent.mode === 'dynamic' ? 'success' : 'default'}>
                  {agent.mode}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMode.mutate({
                      id,
                      mode: agent.mode === 'dynamic' ? 'static' : 'dynamic',
                    })
                  }
                  disabled={setMode.isPending}
                >
                  Switch to {agent.mode === 'dynamic' ? 'static' : 'dynamic'}
                </Button>
              </div>
            </Row>
          </CardContent>
          <CardFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={agent.status === 'deleted'}
            >
              <Trash2 className="h-4 w-4" /> Delete App
            </Button>
          </CardFooter>
        </Card>
      </div>

      <AgentPoliciesCard agentId={id} />

      <ActionGraph agentId={id} />
      <ActionTimeline agentId={id} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Active grants
          </CardTitle>
          <CardDescription>
            Approval Envelopes minted for this agent. Each entry permits silent UCAN mints inside
            its constraint until it expires or you revoke it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {envelopes.data && envelopes.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {envelopes.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {formatEnvelopeAsk({
                        constraint: e.constraint as Parameters<
                          typeof formatEnvelopeAsk
                        >[0]['constraint'],
                        actions: e.actions as string[],
                        ttlSeconds: e.expiresAt
                          ? Math.max(
                              0,
                              Math.floor((new Date(e.expiresAt).getTime() - Date.now()) / 1000),
                            )
                          : null,
                      })}
                      {e.isStanding ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                          standing
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(e.actions as string[]).join(', ')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.expiresAt ? formatDate(e.expiresAt) : 'until revoked'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeEnvelope.mutate({ id: e.id })}
                        disabled={revokeEnvelope.isPending}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Approval Envelopes yet. Envelopes are durable UCAN factories created from the
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">
                /v1/intent
              </code>
              flow after passkey approval; they bound resource scope + actions until expiry or
              revocation. For "Always allow" decisions you made from the dashboard/Telegram, see the{' '}
              <strong>Remembered decisions</strong> card below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Remembered decisions</CardTitle>
          <CardDescription>
            Auto-allow / auto-deny rules written when you tapped "Always allow" or "Always deny"
            during a step-up. The PDP renders each row as a Cedar clause inside the customer bundle,
            so future calls matching <code>command + resource</code> resolve silently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants.data && grants.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.data.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      {g.decision === 'allow' ? (
                        <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">
                          allow
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">deny</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{g.command}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {JSON.stringify(g.resourcePattern).slice(0, 60)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{g.scope}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(g.grantedAt)}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleGrant.mutate({ grantId: g.id })}
                        disabled={toggleGrant.isPending}
                      >
                        Flip
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeGrant.mutate({ grantId: g.id })}
                        disabled={revokeGrant.isPending}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No remembered decisions yet. The first time this agent's call hits a step-up, approve
              or deny with the <em>Remember</em> toggle on to write a row here.
            </p>
          )}
        </CardContent>
      </Card>

      <AgentAuditPanel rows={audit.data ?? []} isPending={audit.isPending} />

      <RevealedKeyDialog secret={revealedKey} onClose={() => setRevealedKey(null)} />

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue API key</DialogTitle>
            <DialogDescription>
              The plaintext is returned once. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="ci, prod-deploy, …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-role">Role</Label>
              <Select
                id="key-role"
                value={keyRole}
                onChange={(e) => setKeyRole(e.target.value as typeof keyRole)}
              >
                <option value="admin">admin — full access</option>
                <option value="agent_manager">agent_manager — mint UCANs, manage agent</option>
                <option value="policy_author">policy_author — read-only on agents</option>
                <option value="auditor">auditor — read-only, cannot mint</option>
                <option value="member">member — minimal scope</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick the least-privilege role for the workload. agent_manager is the safe default
                for an MCP server that only needs to mint UCANs for its bound agent.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIssueOpen(false)}
              disabled={createKey.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createKey.mutate({ agentId: id, name: keyName, role: keyRole })}
              disabled={createKey.isPending || keyName.length === 0}
            >
              {createKey.isPending ? 'Issuing…' : 'Issue key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete App?</DialogTitle>
            <DialogDescription>
              This revokes all authorization grants scoped to <strong>{agent.name}</strong>. PDP
              will reject any future authorize requests for this DID. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteAgent.mutate({ id })}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending ? 'Deleting…' : 'Delete App'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function RevealedKeyDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy this key now</DialogTitle>
          <DialogDescription>
            We&apos;ll never show it again. Storing only the hash means we cannot recover it.
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-auto rounded-md border bg-muted p-3 font-mono text-xs">
          {secret}
        </pre>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (secret) {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              }
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button onClick={onClose}>I&apos;ve saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
