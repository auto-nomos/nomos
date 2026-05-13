'use client';

import { useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDate } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card';
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
  agentId: string;
}

export function AgentPoliciesCard({ agentId }: Props) {
  const utils = trpc.useUtils();
  const mapped = trpc.agents.listPolicies.useQuery({ agentId });
  const allPolicies = trpc.policies.list.useQuery();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const assign = trpc.agents.assignPolicies.useMutation({
    onSuccess: () => {
      utils.agents.listPolicies.invalidate({ agentId });
      setPickerOpen(false);
      setSelected(new Set());
    },
  });
  const unassign = trpc.agents.unassignPolicy.useMutation({
    onSuccess: () => utils.agents.listPolicies.invalidate({ agentId }),
  });

  const mappedIds = useMemo(
    () => new Set((mapped.data ?? []).map((r) => r.policyId)),
    [mapped.data],
  );
  const candidates = useMemo(
    () => (allPolicies.data ?? []).filter((p) => !mappedIds.has(p.id)),
    [allPolicies.data, mappedIds],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Policies</CardTitle>
        <CardDescription>
          The PDP allows an action for this App only when at least one mapped policy permits it. An
          App with no mapped policies denies every call (static) or denies and triggers step-up
          (dynamic). Map one or more policies below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mapped.data && mapped.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Integration</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Mapped</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapped.data.map((row) => (
                <TableRow key={row.mappingId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.integrationId ?? '—'}
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
                      onClick={() =>
                        unassign.mutate({ agentId, policyId: row.policyId })
                      }
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
            No policies mapped yet. This App is denied for every command until you map one.
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button size="sm" onClick={() => setPickerOpen(true)} disabled={candidates.length === 0}>
          Map policy
        </Button>
      </CardFooter>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map policies to this App</DialogTitle>
            <DialogDescription>
              Tick one or more policies. The PDP bundle re-renders immediately; new calls evaluate
              against the new mapping.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">All policies already mapped.</p>
            ) : (
              candidates.map((p) => (
                <Label
                  key={p.id}
                  className="flex items-start gap-3 rounded border p-2 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelected(next);
                    }}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.integrationId ?? 'general'}
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
              onClick={() =>
                assign.mutate({ agentId, policyIds: Array.from(selected) })
              }
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
