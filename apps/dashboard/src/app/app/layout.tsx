'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { NomosShell } from '../../components/nomos/shell';
import { useSession } from '../../lib/auth-client';
import { trpc } from '../../lib/trpc';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  // Skip the enrollment query until we have a session — saves an
  // unauthenticated round-trip and avoids a render flicker.
  const enrollment = trpc.auth.passkeyStatus.useQuery(undefined, {
    enabled: !!session.data,
  });

  useEffect(() => {
    if (!session.isPending && !session.data) {
      router.replace('/sign-in');
      return;
    }
    if (session.data && enrollment.data && !enrollment.data.enrolled) {
      router.replace('/onboarding/enroll-passkey');
    }
  }, [session.isPending, session.data, enrollment.data, router]);

  if (session.isPending || (session.data && enrollment.isPending)) {
    return (
      <main data-theme="aegis" className="grid min-h-screen place-items-center bg-aegis-ink">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-aegis-mute">
          <span className="pulse" />
          loading
        </div>
      </main>
    );
  }
  if (!session.data) return null;
  if (enrollment.data && !enrollment.data.enrolled) return null;

  return <NomosShell>{children}</NomosShell>;
}
