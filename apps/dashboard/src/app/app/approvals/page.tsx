'use client';

import Link from 'next/link';
import { type ReactElement, useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { trpc } from '../../../lib/trpc';

type Tab = 'pending' | 'approved' | 'denied' | 'expired';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'denied', label: 'Denied' },
  { id: 'expired', label: 'Expired' },
];

function decisionBadge(state: string): ReactElement {
  if (state === 'approved')
    return <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">approved</Badge>;
  if (state === 'denied')
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">denied</Badge>;
  if (state === 'expired')
    return (
      <Badge variant="outline" className="text-zinc-500">
        expired
      </Badge>
    );
  return <Badge variant="outline">{state}</Badge>;
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [agentId, setAgentId] = useState<string>('all');

  const agents = trpc.agents.list.useQuery();
  const pending = trpc.stepup.listPending.useQuery(undefined, {
    refetchInterval: tab === 'pending' ? 3000 : false,
    enabled: tab === 'pending',
  });
  const history = trpc.stepup.listHistory.useQuery(
    {
      ...(tab !== 'pending' ? { state: [tab] } : {}),
      ...(agentId !== 'all' ? { agentId } : {}),
      limit: 100,
    },
    { enabled: tab !== 'pending', refetchInterval: 10000 },
  );

  const rows = useMemo(() => {
    if (tab === 'pending') {
      const data = pending.data ?? [];
      return agentId === 'all' ? data : data.filter((r) => r.agentId === agentId);
    }
    return history.data ?? [];
  }, [tab, pending.data, history.data, agentId]);

  const loading = tab === 'pending' ? pending.isLoading : history.isLoading;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-zinc-500">
          Step-up requests and their resolution. Pending auto-refreshes every 3s; resolved tabs
          refresh every 10s. Each new pending request also fires a Telegram push when linked.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                tab === t.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="agent-filter" className="text-xs text-zinc-500">
            Agent
          </label>
          <select
            id="agent-filter"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="all">All agents</option>
            {(agents.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {TABS.find((t) => t.id === tab)?.label} ({rows.length})
          </CardTitle>
          <CardDescription>
            {tab === 'pending'
              ? 'Approvals expire automatically. Open one to register a passkey + approve / deny, or use the Telegram bot for one-tap decisions.'
              : 'Resolved approval history. Click a row to inspect the same UI you saw at decision time.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {tab === 'pending'
                ? "No pending approvals. When an agent's call is denied by policy, a step-up request shows up here and a Telegram push (if linked) fires simultaneously."
                : 'No matching rows.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Resource</TableHead>
                  {tab !== 'pending' ? <TableHead>State</TableHead> : null}
                  <TableHead>{tab === 'pending' ? 'Requested' : 'Decided'}</TableHead>
                  <TableHead>{tab === 'pending' ? 'Expires' : 'Requested'}</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const resourceStr = JSON.stringify(r.resource).slice(0, 80);
                  const requestedAt = new Date(r.requestedAt).toLocaleString();
                  const isHistory = tab !== 'pending';
                  const decidedAt =
                    isHistory && 'decidedAt' in r && r.decidedAt
                      ? new Date(r.decidedAt as string | Date).toLocaleString()
                      : '—';
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.agentName ?? r.agentId}</TableCell>
                      <TableCell className="font-mono text-xs">{r.command}</TableCell>
                      <TableCell className="font-mono text-xs">{resourceStr}</TableCell>
                      {isHistory ? (
                        <TableCell>
                          {decisionBadge((r as unknown as { state: string }).state)}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-xs text-zinc-500">
                        {isHistory ? decidedAt : new Date(r.requestedAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {isHistory ? (
                          requestedAt
                        ) : (
                          <Badge variant="outline">
                            {new Date(r.expiresAt).toLocaleTimeString()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant={isHistory ? 'ghost' : 'default'}>
                          <Link href={`/approve/${r.id}`}>{isHistory ? 'View' : 'Review'}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
