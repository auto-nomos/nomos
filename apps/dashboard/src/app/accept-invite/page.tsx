'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { useSession } from '../../lib/auth-client';
import { trpc } from '../../lib/trpc';

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();
  const session = useSession();
  const accept = trpc.invites.accept.useMutation();
  const [autoAttempted, setAutoAttempted] = useState(false);

  // Auto-attempt once the session resolves. The mutation surfaces all four
  // branches (joined / wrong_account / needs_signup / error) so the user can
  // pick the right next step.
  useEffect(() => {
    if (autoAttempted || !token) return;
    if (session.isPending) return;
    setAutoAttempted(true);
    accept.mutate({ token });
  }, [autoAttempted, token, session.isPending, accept]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>You&apos;ve been invited to join a Nomos organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <p className="text-sm text-destructive">
              Missing invite token. Open the invitation link from your email.
            </p>
          ) : null}

          {accept.isPending ? (
            <p className="text-sm text-muted-foreground">Verifying invite…</p>
          ) : null}

          {accept.data?.status === 'joined' ? (
            <div className="space-y-3">
              <p className="text-sm">
                You&apos;re in. Welcome to{' '}
                <span className="font-medium">{accept.data.orgName}</span> as{' '}
                <span className="font-medium">{accept.data.role}</span>.
              </p>
              <Button onClick={() => router.push('/app')} className="w-full">
                Open dashboard
              </Button>
            </div>
          ) : null}

          {accept.data?.status === 'wrong_account' ? (
            <div className="space-y-3">
              <p className="text-sm">
                This invite is for <span className="font-mono">{accept.data.inviteEmail}</span>, but
                you&apos;re signed in as{' '}
                <span className="font-mono">{accept.data.sessionEmail}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Sign out and back in as the invited email, then re-open the link.
              </p>
              <Button onClick={() => router.push('/sign-in')} className="w-full" variant="outline">
                Sign out
              </Button>
            </div>
          ) : null}

          {accept.data?.status === 'needs_signup' ? (
            <div className="space-y-3">
              <p className="text-sm">
                Create an account for <span className="font-mono">{accept.data.email}</span> to join{' '}
                <span className="font-medium">{accept.data.orgName}</span> as{' '}
                <span className="font-medium">{accept.data.role}</span>.
              </p>
              <Button
                onClick={() =>
                  router.push(
                    `/sign-up?invite_token=${encodeURIComponent(token)}&email=${encodeURIComponent(
                      (accept.data && accept.data.status === 'needs_signup' && accept.data.email) ||
                        '',
                    )}`,
                  )
                }
                className="w-full"
              >
                Create account
              </Button>
            </div>
          ) : null}

          {accept.error ? <p className="text-sm text-destructive">{accept.error.message}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
