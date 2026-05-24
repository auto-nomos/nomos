'use client';

import { ArrowRight, Fingerprint, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '../../components/nomos/auth-shell';
import { authClient } from '../../lib/auth-client';
import { authenticatePasskey } from '../../lib/passkey-client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLegacy, setShowLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatePasskey({ conditionalUI: true })
      .then(() => {
        if (cancelled) return;
        // Hard nav: ensures the just-set session cookie rides the first /app
        // request and Next doesn't reuse a logged-out RSC cache.
        window.location.assign('/app');
      })
      .catch(() => {
        /* user dismissed conditional UI; ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPasskey() {
    setError(null);
    setSubmitting(true);
    try {
      await authenticatePasskey(email ? { email } : undefined);
      window.location.assign('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
      setSubmitting(false);
    }
  }

  async function onLegacySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? 'sign-in failed');
        setSubmitting(false);
        return;
      }
      // Middleware-equivalent gate at the layout level routes the session
      // to /onboarding/enroll-passkey when no passkey exists yet.
      window.location.assign('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="welcome · passkey"
      title={
        <>
          Sign in with
          <br />
          your <em>passkey</em>.
          <br />
          One tap.
        </>
      }
      copy="Touch ID, Windows Hello, or any FIDO2 security key. No password to phish, no token to leak."
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
        Use the passkey on this device. If you&rsquo;re on a new device, you can recover via email.
      </p>

      <div className="mt-9 space-y-5">
        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username webauthn"
          placeholder="ada@acme.com"
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
          type="button"
          onClick={onPasskey}
          disabled={submitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-aegis-signal px-5 py-3.5 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
        >
          <Fingerprint className="h-4 w-4" />
          {submitting ? 'Verifying…' : 'Sign in with passkey'}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        <div className="flex items-center justify-between text-xs">
          <Link href="/recover" className="text-aegis-mute hover:text-aegis-paper">
            Lost your device?
          </Link>
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="text-aegis-faint hover:text-aegis-mute"
          >
            {showLegacy ? 'Hide legacy sign-in' : 'Have a legacy password?'}
          </button>
        </div>

        {showLegacy ? (
          <form
            onSubmit={onLegacySubmit}
            className="mt-3 space-y-4 rounded-sm border border-aegis-line bg-aegis-ink/40 p-4"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
              <KeyRound className="mr-2 inline-block h-3 w-3" />
              Grace-period password sign-in
            </p>
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
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:border-aegis-signal/40 disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in with password'}
            </button>
            <p className="font-mono text-[10px] text-aegis-faint">
              We&rsquo;ll prompt you to enroll a passkey immediately after.
            </p>
          </form>
        ) : null}
      </div>
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
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
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
        className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper placeholder:text-aegis-faint focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
      />
    </div>
  );
}
