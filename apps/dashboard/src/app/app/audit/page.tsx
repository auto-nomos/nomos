'use client';

import { Clock, Download, ShieldCheck } from 'lucide-react';
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
  agentName: string | null;
  command: string;
  decision: Decision;
  resource: unknown;
  context: unknown;
  prevHash: string;
  hash: string;
  payload: unknown;
  parentReceiptId?: string | null;
  swarmId?: string | null;
  chainDepth?: number | null;
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
    const header = [
      'ts',
      'agentName',
      'agentDid',
      'command',
      'decision',
      'eventId',
      'prevHash',
      'hash',
      'chainDepth',
      'swarmId',
      'parentReceiptId',
      'resource',
      'context',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          new Date(r.ts).toISOString(),
          csvEscape(r.agentName ?? ''),
          csvEscape(r.agent),
          csvEscape(r.command),
          r.decision,
          r.eventId,
          r.prevHash,
          r.hash,
          r.chainDepth ?? '',
          r.swarmId ?? '',
          r.parentReceiptId ?? '',
          csvEscape(JSON.stringify(r.resource ?? null)),
          csvEscape(JSON.stringify(r.context ?? null)),
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
                    <TableCell title={r.agent}>
                      {r.agentName ? (
                        <span className="font-medium">{r.agentName}</span>
                      ) : (
                        <span className="font-mono text-xs">
                          {r.agent.length > 24
                            ? `${r.agent.slice(0, 18)}…${r.agent.slice(-4)}`
                            : r.agent}
                        </span>
                      )}
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
  const proofSigned = proof.data?.root != null;

  function downloadProof() {
    if (!proof.data || !event) return;
    const blob = new Blob([JSON.stringify(proof.data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `audit-proof-${event.eventId}.json`);
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Decision detail</DialogTitle>
              <DialogDescription>
                Hash-chained Cedar decision. Download the signed proof bundle and verify with the
                CLI.
              </DialogDescription>
            </div>
            {proof.isPending && event ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Loading proof…
              </span>
            ) : proofSigned ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                data-testid="proof-signed-badge"
                title="Hash-chained decision anchored under an Ed25519-signed root"
              >
                <ShieldCheck className="h-3 w-3" /> Signed proof
              </span>
            ) : proof.data && event ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
                data-testid="proof-unsigned-pill"
                title="The root signature for this period has not been minted yet"
              >
                <Clock className="h-3 w-3" /> Proof pending
              </span>
            ) : null}
          </div>
        </DialogHeader>

        {event ? (
          <div className="space-y-4 text-sm">
            <Row label="Event ID">
              <span className="font-mono text-xs">{event.eventId}</span>
            </Row>
            <Row label="Time">{formatDate(event.ts)}</Row>
            <Row label="App">
              <div className="flex flex-col items-end">
                {event.agentName ? <span className="font-medium">{event.agentName}</span> : null}
                <span className="font-mono text-[11px] text-muted-foreground">{event.agent}</span>
              </div>
            </Row>
            <Row label="Command">
              <span className="font-mono text-xs">{event.command}</span>
            </Row>
            {event.chainDepth !== null && event.chainDepth !== undefined ? (
              <Row label="Chain depth">{event.chainDepth}</Row>
            ) : null}
            {event.swarmId ? (
              <Row label="Swarm">
                <span className="font-mono text-xs">{event.swarmId}</span>
              </Row>
            ) : null}
            {event.parentReceiptId ? (
              <Row label="Parent receipt">
                <span className="font-mono text-xs">{event.parentReceiptId.slice(0, 16)}…</span>
              </Row>
            ) : null}
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

            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="font-medium">Verify offline</p>
              <p className="mt-1 text-muted-foreground">
                Download the proof bundle, then run the audit-verify CLI to confirm the hash chain
                and the root signature.
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
                {`npx @auto-nomos/audit-verify audit-proof-${event.eventId.slice(0, 8)}.json`}
              </pre>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={downloadProof}
            disabled={!proof.data || proof.isPending}
            data-testid="download-proof"
          >
            <Download className="h-4 w-4" />
            Download proof
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
