'use client';

import { ArrowRight, Fingerprint } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '../../components/nomos/auth-shell';
import { authClient } from '../../lib/auth-client';
import { registerPasskey } from '../../lib/passkey-client';
import { trpc } from '../../lib/trpc';

function generateStrongRandomPassword(): string {
  // The user never sees or types this — the server still requires the
  // emailAndPassword field during the grace period, so we satisfy the
  // 12-char minimum with a cryptographically random base64 string.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, 'x');
}

export default function SignUpPage() {
  const router = useRouter();
  const markEnrolled = trpc.auth.markPasskeyEnrolled.useMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'enrolling'>('form');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const password = generateStrongRandomPassword();
      const signupResult = await authClient.signUp.email({ email, password, name });
      if (signupResult.error) {
        setError(signupResult.error.message ?? 'sign-up failed');
        setSubmitting(false);
        return;
      }
      setStep('enrolling');
      try {
        await registerPasskey({ name: defaultDeviceLabel() });
      } catch (enrollErr) {
        const msg = enrollErr instanceof Error ? enrollErr.message : 'unknown';
        setError(`Passkey enrollment failed: ${msg}. Try /onboarding/enroll-passkey to retry.`);
        router.push('/onboarding/enroll-passkey');
        return;
      }
      await markEnrolled.mutateAsync();
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="onboarding · passkey"
      title={
        <>
          One workspace.
          <br />
          One <em>passkey</em>.
          <br />
          Zero passwords.
        </>
      }
      copy="Nomos is passwordless. We register a passkey on this device when you sign up — Touch ID, Windows Hello, or any FIDO2 authenticator works."
      footer={
        <p className="text-sm text-aegis-mute">
          Already onboard?{' '}
          <Link className="text-aegis-paper hover:text-aegis-signal" href="/sign-in">
            Sign in →
          </Link>
        </p>
      }
    >
      <div className="eyebrow">create account</div>
      <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper">Begin.</h2>
      <p className="mt-3 text-sm text-aegis-mute">
        We&rsquo;ll prompt you for a passkey right after you create the account — biometric or
        security key. No password to remember.
      </p>

      <form onSubmit={onSubmit} className="mt-9 space-y-5">
        <Field
          id="name"
          label="Your name"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Ada Lovelace"
          required
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email webauthn"
          placeholder="ada@acme.com"
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
          {step === 'enrolling' ? (
            <>
              <Fingerprint className="h-4 w-4" />
              Enrolling passkey…
            </>
          ) : submitting ? (
            'Creating…'
          ) : (
            <>
              Create + enroll passkey
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          By continuing you agree to our terms · privacy
        </p>
      </form>
    </AuthShell>
  );
}

function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'Mac (Touch ID)';
  if (ua.includes('windows')) return 'Windows (Hello)';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS device';
  if (ua.includes('android')) return 'Android device';
  return 'This device';
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
