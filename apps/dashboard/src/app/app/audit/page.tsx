'use client';

import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { trpc } from '../../../lib/trpc';
import { formatDate } from '../../../lib/utils';

type Decision = 'allow' | 'deny' | 'stepup';

interface AuditRow {
  eventId: string;
  ts: string | Date;
  agent: string;
  command: string;
  decision: Decision;
  resource: unknown;
  context: unknown;
  prevHash: string;
  hash: string;
  payload: unknown;
}

export default function AuditPage() {
  const [agent, setAgent] = useState('');
  const [command, setCommand] = useState('');
  const [decision, setDecision] = useState<'' | Decision>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(100);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const audit = trpc.audit.list.useQuery({
    agent: agent || undefined,
    command: command || undefined,
    decision: (decision as Decision) || undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    limit,
  });

  const rows = (audit.data ?? []) as AuditRow[];
  const filename = useMemo(
    () => `audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
    [],
  );

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${filename}.json`);
  }

  function exportCsv() {
    const header = ['ts', 'agent', 'command', 'decision', 'eventId', 'hash'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          new Date(r.ts).toISOString(),
          csvEscape(r.agent),
          csvEscape(r.command),
          r.decision,
          r.eventId,
          r.hash,
        ].join(','),
      );
    }
    triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), `${filename}.csv`);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Every authorize and proxy decision lands here, hash-chained.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> JSON
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>All fields scope to your customer automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterField label="App (DID)" id="agent">
            <Input
              id="agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="did:key:…"
            />
          </FilterField>
          <FilterField label="Command" id="command">
            <Input
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="/github/issue/create"
            />
          </FilterField>
          <FilterField label="Decision" id="decision">
            <Select
              id="decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as Decision | '')}
            >
              <option value="">Any</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="stepup">Step-up</option>
            </Select>
          </FilterField>
          <FilterField label="From" id="from">
            <Input
              id="from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </FilterField>
          <FilterField label="To" id="to">
            <Input
              id="to"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </FilterField>
          <FilterField label="Limit" id="limit">
            <Select id="limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </Select>
          </FilterField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <CardDescription>{rows.length} rows</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match the current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.eventId}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="text-xs">{formatDate(r.ts)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.agent.length > 24
                        ? `${r.agent.slice(0, 18)}…${r.agent.slice(-4)}`
                        : r.agent}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.command}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.decision === 'allow'
                            ? 'success'
                            : r.decision === 'stepup'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {r.decision}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.eventId.slice(0, 8)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AuditDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AuditDrawer({ event, onClose }: { event: AuditRow | null; onClose: () => void }) {
  const proof = trpc.audit.proof.useQuery({ eventId: event?.eventId ?? '' }, { enabled: !!event });

  return (
    <Dialog open={event !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Decision detail</DialogTitle>
          <DialogDescription>
            Hash-chain proof button stub until Sprint 8 (signed root + R2 archive).
          </DialogDescription>
        </DialogHeader>

        {event ? (
          <div className="space-y-4 text-sm">
            <Row label="Event ID">
              <span className="font-mono text-xs">{event.eventId}</span>
            </Row>
            <Row label="Time">{formatDate(event.ts)}</Row>
            <Row label="App">
              <span className="font-mono text-xs">{event.agent}</span>
            </Row>
            <Row label="Command">
              <span className="font-mono text-xs">{event.command}</span>
            </Row>
            <Row label="Decision">
              <Badge
                variant={
                  event.decision === 'allow'
                    ? 'success'
                    : event.decision === 'stepup'
                      ? 'warning'
                      : 'destructive'
                }
              >
                {event.decision}
              </Badge>
            </Row>
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs font-medium">Resource</summary>
              <pre className="mt-2 max-h-40 overflow-auto text-xs">
                {JSON.stringify(event.resource, null, 2)}
              </pre>
            </details>
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs font-medium">Payload</summary>
              <pre className="mt-2 max-h-60 overflow-auto text-xs">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </details>
            <Row label="prevHash">
              <span className="font-mono text-xs">{event.prevHash.slice(0, 16)}…</span>
            </Row>
            <Row label="hash">
              <span className="font-mono text-xs">{event.hash.slice(0, 16)}…</span>
            </Row>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={!proof.data}>
            Show proof (S8)
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
