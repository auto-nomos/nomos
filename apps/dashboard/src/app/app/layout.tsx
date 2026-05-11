'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { NomosShell } from '../../components/nomos/shell';
import { useSession } from '../../lib/auth-client';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.isPending && !session.data) {
      router.replace('/sign-in');
    }
  }, [session.isPending, session.data, router]);

  if (session.isPending) {
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

  return <NomosShell>{children}</NomosShell>;
}
