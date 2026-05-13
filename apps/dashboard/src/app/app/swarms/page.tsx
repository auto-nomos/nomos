'use client';

import { Network, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
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

export default function SwarmsPage() {
  const list = trpc.swarms.list.useQuery();
  const agents = trpc.agents.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.swarms.create.useMutation({
    onSuccess: () => utils.swarms.list.invalidate(),
  });
  const [name, setName] = useState('');
  const [rootAgentId, setRootAgentId] = useState('');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Swarms</h1>
        <p className="text-sm text-muted-foreground">
          A swarm groups a tree of Apps that delegate to each other. Trust propagates root → leaf;
          each child UCAN attenuates its parent. Open a swarm to see live trust flow and scope
          containment.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create swarm</CardTitle>
          <CardDescription>Pick the root App; children are attached later.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. research-team"
            className="max-w-xs"
          />
          <select
            value={rootAgentId}
            onChange={(e) => setRootAgentId(e.target.value)}
            className="rounded border px-2 text-sm"
          >
            <option value="">pick root agent…</option>
            {(agents.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => create.mutate({ name, rootAgentId })}
            disabled={!name || !rootAgentId || create.isPending}
          >
            <Plus className="mr-1 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All swarms</CardTitle>
        </CardHeader>
        <CardContent>
          {!list.data || list.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No swarms yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-32">Max depth</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Network className="h-4 w-4" />
                        {s.name}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(s.createdAt)}</TableCell>
                    <TableCell>{s.maxDepth ?? 8}</TableCell>
                    <TableCell>
                      <Link className="text-sm text-primary underline" href={`/app/swarms/${s.id}`}>
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
