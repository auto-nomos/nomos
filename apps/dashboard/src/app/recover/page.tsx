'use client';

import { ArrowRight, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '../../components/nomos/auth-shell';
import { authClient } from '../../lib/auth-client';

type Step = 'email' | 'code' | 'done';

export default function RecoverPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (result.error) {
        setError(result.error.message ?? 'failed to send code');
        return;
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.emailOtp({ email, otp: code });
      if (result.error) {
        setError(result.error.message ?? 'invalid or expired code');
        return;
      }
      router.push('/onboarding/enroll-passkey');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="recovery · email otp"
      title={
        <>
          Lost your
          <br />
          <em>device</em>?
          <br />
          We&rsquo;ve got you.
        </>
      }
      copy="We'll email a one-time code so you can sign in, then enroll a new passkey on this device. The code expires in 10 minutes."
      footer={
        <p className="text-sm text-aegis-mute">
          Back to{' '}
          <Link className="text-aegis-paper hover:text-aegis-signal" href="/sign-in">
            sign in →
          </Link>
        </p>
      }
    >
      <div className="eyebrow">recover access</div>
      <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper">Recover.</h2>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-9 space-y-5">
          <Field
            id="email"
            label="Account email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="ada@acme.com"
            autoComplete="email"
            required
          />
          {error ? <ErrorBox>{error}</ErrorBox> : null}
          <Submit submitting={submitting}>
            Send recovery code
            <ArrowRight className="h-4 w-4" />
          </Submit>
        </form>
      ) : null}

      {step === 'code' ? (
        <form onSubmit={verifyCode} className="mt-9 space-y-5">
          <p className="rounded-sm border border-aegis-line bg-aegis-ink/40 px-4 py-3 text-xs text-aegis-mute">
            <MailCheck className="mr-2 inline-block h-3 w-3" />
            Sent a 6-digit code to <span className="text-aegis-paper">{email}</span>. Check your
            inbox.
          </p>
          <Field
            id="code"
            label="One-time code"
            type="text"
            value={code}
            onChange={setCode}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
          />
          {error ? <ErrorBox>{error}</ErrorBox> : null}
          <Submit submitting={submitting}>
            Verify + continue
            <ArrowRight className="h-4 w-4" />
          </Submit>
          <button
            type="button"
            onClick={() => {
              setCode('');
              setError(null);
              setStep('email');
            }}
            className="block w-full text-center text-xs text-aegis-faint hover:text-aegis-mute"
          >
            Use a different email
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-sm border border-aegis-coral/40 bg-aegis-coral/10 px-4 py-3 font-mono text-xs text-aegis-coral"
    >
      {children}
    </div>
  );
}

function Submit({ submitting, children }: { submitting: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-aegis-signal px-5 py-3.5 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
    >
      {submitting ? 'Working…' : children}
    </button>
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
  maxLength,
  inputMode,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: 'numeric' | 'text' | 'email';
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
        maxLength={maxLength}
        inputMode={inputMode}
        className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper placeholder:text-aegis-faint focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
      />
    </div>
  );
}
