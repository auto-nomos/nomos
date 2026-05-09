'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { authClient } from '../../lib/auth-client';
import { clientEnv } from '../../lib/env';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? 'sign-in failed');
        return;
      }
      router.push('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {clientEnv.workosEnabled ? (
              <Button variant="outline" type="button" className="w-full" disabled>
                Continue with WorkOS SSO (enabled in prod)
              </Button>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{' '}
              <Link className="text-foreground underline" href="/sign-up">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
