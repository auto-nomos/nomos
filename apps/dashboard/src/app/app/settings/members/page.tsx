'use client';

import { Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
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
import { Select } from '../../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { trpc } from '../../../../lib/trpc';
import { formatDate } from '../../../../lib/utils';

const INVITABLE_ROLES = ['admin', 'agent_manager', 'policy_author', 'auditor', 'member'] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const ASSIGNABLE_ROLES = ['owner', ...INVITABLE_ROLES] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  owner: 'Full control incl. billing + delete the org.',
  admin: 'Everything except delete the org or change billing.',
  agent_manager: 'Manage agents, grants, swarms. Read policies + audit.',
  policy_author: 'Author policies + schemas. Read agents + audit.',
  auditor: 'Read-only across audit, agents, policies, grants.',
  member: 'Minimal — see members + the org name only.',
};

export default function MembersPage() {
  const me = trpc.auth.me.useQuery();
  const members = trpc.members.list.useQuery();
  const invites = trpc.invites.list.useQuery();
  const utils = trpc.useUtils();

  const canManage = (() => {
    const perms = me.data?.permissions;
    return Boolean(perms?.members?.includes('update') && perms?.invites?.includes('create'));
  })();

  const changeRole = trpc.members.changeRole.useMutation({
    onSuccess: () => utils.members.list.invalidate(),
  });
  const removeMember = trpc.members.remove.useMutation({
    onSuccess: () => utils.members.list.invalidate(),
  });
  const createInvite = trpc.invites.create.useMutation({
    onSuccess: () => {
      utils.invites.list.invalidate();
      setInviteEmail('');
    },
  });
  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => utils.invites.list.invalidate(),
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('agent_manager');

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
            <p className="text-sm text-muted-foreground">
              Manage who can access this organization and what they can do.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/app/guide/members"
              className="rounded-sm border border-aegis-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
            >
              Roles guide →
            </Link>
            <Link
              href="/app/guide/invites"
              className="rounded-sm border border-aegis-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
            >
              Invite guide →
            </Link>
          </div>
        </div>
      </header>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" /> Invite a teammate
            </CardTitle>
            <CardDescription>
              They&apos;ll get an email with a one-click link to join. The link expires in 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!inviteEmail) return;
                createInvite.mutate({ email: inviteEmail, role: inviteRole });
              }}
            >
              <div className="flex-1 min-w-[220px]">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="w-[200px]">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InvitableRole)}
                >
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-medium">{inviteRole}</span> — {ROLE_DESCRIPTIONS[inviteRole]}
            </p>
            {createInvite.error ? (
              <p className="mt-2 text-sm text-destructive">{createInvite.error.message}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({members.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data?.map((m) => (
                  <TableRow key={m.membershipId}>
                    <TableCell>
                      <div className="font-medium">{m.name || m.email.split('@')[0]}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      {canManage && me.data?.user.id !== m.userId ? (
                        <Select
                          className="h-8 w-[160px]"
                          value={m.role}
                          onChange={(e) =>
                            changeRole.mutate({
                              membershipId: m.membershipId,
                              role: e.target.value as AssignableRole,
                            })
                          }
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge variant="outline">{m.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(m.joinedAt)}
                    </TableCell>
                    <TableCell>
                      {canManage && me.data?.user.id !== m.userId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              confirm(
                                `Remove ${m.email} from this organization? Their existing UCANs / API keys remain valid until separately revoked.`,
                              )
                            ) {
                              removeMember.mutate({ membershipId: m.membershipId });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {changeRole.error ? (
            <p className="mt-2 text-sm text-destructive">{changeRole.error.message}</p>
          ) : null}
          {removeMember.error ? (
            <p className="mt-2 text-sm text-destructive">{removeMember.error.message}</p>
          ) : null}
        </CardContent>
      </Card>

      {invites.data && invites.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites ({invites.data.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.data.map((i) => (
                  <TableRow key={i.inviteId}>
                    <TableCell className="font-mono text-sm">{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{i.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.expired ? 'expired' : formatDate(i.expiresAt)}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeInvite.mutate({ inviteId: i.inviteId })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
