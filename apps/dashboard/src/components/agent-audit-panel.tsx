'use client';

import { ChevronRight, Download, Loader2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDate } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface AuditRow {
  eventId: string;
  ts: Date;
  command: string | null;
  decision: 'allow' | 'deny' | 'stepup';
  hash: string;
  prevHash: string;
  payload?: unknown;
}

export function AgentAuditPanel({ rows, isPending }: { rows: AuditRow[]; isPending: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [proofPending, setProofPending] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  async function downloadProof(eventId: string) {
    setProofPending(eventId);
    setProofError(null);
    try {
      const data = await utils.audit.proof.fetch({ eventId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-proof-${eventId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'proof fetch failed');
    } finally {
      setProofPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent audit</CardTitle>
        <CardDescription>
          Last 50 decisions involving this DID. Click a row to expand resource + context. Verify
          downloads the canonical AuditBundle for offline replay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Time</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Hash</TableHead>
                <TableHead className="text-right">Proof</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isOpen = expanded === row.eventId;
                const payload = (row.payload ?? {}) as Record<string, unknown>;
                const resource = payload.resource as Record<string, unknown> | undefined;
                const context = payload.context as Record<string, unknown> | undefined;
                return (
                  <Fragment key={row.eventId}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : row.eventId)}
                    >
                      <TableCell>
                        <ChevronRight
                          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(row.ts)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.command ?? '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.decision === 'allow'
                              ? 'success'
                              : row.decision === 'stepup'
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {row.decision}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.hash.slice(0, 10)}…
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={proofPending !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadProof(row.eventId);
                          }}
                          title="Download AuditBundle JSON for offline verify"
                        >
                          {proofPending === row.eventId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="grid gap-3 py-2 text-xs sm:grid-cols-2">
                            <div>
                              <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">
                                Resource
                              </p>
                              <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                                {JSON.stringify(resource ?? {}, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">
                                Context
                              </p>
                              <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                                {JSON.stringify(context ?? {}, null, 2)}
                              </pre>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">
                                Chain
                              </p>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                prev: {row.prevHash}
                              </p>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                hash: {row.hash}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No audit events yet.</p>
        )}
        {proofError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            Proof failed: {proofError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
