'use client';

import { useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDate, shortId } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface Props {
  policyId: string;
}

export function PolicyAgentsCard({ policyId }: Props) {
  const utils = trpc.useUtils();
  const mapped = trpc.policies.listAgents.useQuery({ policyId });
  const allAgents = trpc.agents.list.useQuery();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const assign = trpc.policies.assignAgents.useMutation({
    onSuccess: () => {
      utils.policies.listAgents.invalidate({ policyId });
      setPickerOpen(false);
      setSelected(new Set());
    },
  });
  const unassign = trpc.agents.unassignPolicy.useMutation({
    onSuccess: () => utils.policies.listAgents.invalidate({ policyId }),
  });

  const mappedIds = useMemo(
    () => new Set((mapped.data ?? []).map((r) => r.agentId)),
    [mapped.data],
  );
  const candidates = useMemo(
    () => (allAgents.data ?? []).filter((a) => !mappedIds.has(a.id) && a.status !== 'deleted'),
    [allAgents.data, mappedIds],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Used by</CardTitle>
        <CardDescription>
          Apps mapped to this policy. The PDP evaluates this policy against an authorize request
          only when the calling App is in this list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mapped.data && mapped.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>DID</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Mapped</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapped.data.map((row) => (
                <TableRow key={row.mappingId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortId(row.did, 14, 6)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.mode === 'dynamic' ? 'success' : 'default'}>
                      {row.mode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.source === 'step_up' ? 'success' : 'default'}>
                      {row.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unassign.mutate({ agentId: row.agentId, policyId })}
                      disabled={unassign.isPending}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not mapped to any App. This policy is dormant until you map it to at least one.
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button size="sm" onClick={() => setPickerOpen(true)} disabled={candidates.length === 0}>
          Map App
        </Button>
      </CardFooter>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map this policy to Apps</DialogTitle>
            <DialogDescription>
              Tick one or more Apps. The PDP bundle re-renders immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">All Apps already mapped.</p>
            ) : (
              candidates.map((a) => (
                <Label
                  key={a.id}
                  className="flex items-start gap-3 rounded border p-2 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(a.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setSelected(next);
                    }}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {shortId(a.did, 14, 6)} · {a.mode}
                    </span>
                  </span>
                </Label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPickerOpen(false);
                setSelected(new Set());
              }}
              disabled={assign.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => assign.mutate({ policyId, agentIds: Array.from(selected) })}
              disabled={assign.isPending || selected.size === 0}
            >
              {assign.isPending ? 'Mapping…' : `Map ${selected.size || ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
