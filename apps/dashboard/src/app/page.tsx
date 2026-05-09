import Link from 'next/link';
import { Button } from '../components/ui/button';

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Credential Broker</h1>
        <p className="max-w-xl text-muted-foreground">
          Agent Authorization Platform. Mint capability tokens (UCAN) bound to OAuth grants. PDP
          enforces Cedar policies before any SaaS call.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    </main>
  );
}
