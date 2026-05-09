'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppNav } from '../../components/nav';
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
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }
  if (!session.data) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container py-8">{children}</div>
    </div>
  );
}
