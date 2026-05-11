'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '../../components/nomos/auth-shell';
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
    <AuthShell
      eyebrow="welcome · v0.1.x"
      title={
        <>
          Sign in.
          <br />
          Pick up <em>where</em>
          <br />
          you left off.
        </>
      }
      copy="Nomos sessions live in the browser. Your control plane keeps the secrets — your team keeps the keys."
      footer={
        <p className="text-sm text-aegis-mute">
          No account?{' '}
          <Link className="text-aegis-paper hover:text-aegis-signal" href="/sign-up">
            Create one →
          </Link>
        </p>
      }
    >
      <div className="eyebrow">sign in</div>
      <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper">Welcome back.</h2>
      <p className="mt-3 text-sm text-aegis-mute">
        Enter your credentials. Step-up may be required for high-risk actions once you&rsquo;re in.
      </p>

      <form onSubmit={onSubmit} className="mt-9 space-y-5">
        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="ada@acme.com"
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
        {error ? (
          <div
            role="alert"
            className="rounded-sm border border-aegis-coral/40 bg-aegis-coral/10 px-4 py-3 font-mono text-xs text-aegis-coral"
          >
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-aegis-signal px-5 py-3.5 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        {clientEnv.workosEnabled ? (
          <button
            type="button"
            disabled
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute"
          >
            Continue with WorkOS SSO (prod only)
          </button>
        ) : null}
      </form>
    </AuthShell>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper placeholder:text-aegis-faint focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
      />
    </div>
  );
}
