'use client';

import { ArrowRight, Fingerprint } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '../../../components/nomos/auth-shell';
import { authClient, useSession } from '../../../lib/auth-client';
import { registerPasskey } from '../../../lib/passkey-client';
import { trpc } from '../../../lib/trpc';

export default function EnrollPasskeyPage() {
  const router = useRouter();
  const session = useSession();
  const markEnrolled = trpc.auth.markPasskeyEnrolled.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onEnroll() {
    setError(null);
    setSubmitting(true);
    try {
      await registerPasskey({ name: defaultDeviceLabel() });
      await markEnrolled.mutateAsync();
      router.push('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'passkey enrollment failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="onboarding · passkey required"
      title={
        <>
          One last
          <br />
          <em>step</em>.
          <br />
          Enroll a passkey.
        </>
      }
      copy="Nomos is passwordless. Before you can access the workspace, register a passkey on this device — Touch ID, Windows Hello, or any FIDO2 security key."
      footer={
        <p className="text-sm text-aegis-mute">
          Wrong account?{' '}
          <button
            type="button"
            onClick={() => void authClient.signOut().then(() => router.push('/sign-in'))}
            className="text-aegis-paper hover:text-aegis-signal"
          >
            Sign out →
          </button>
        </p>
      }
    >
      <div className="eyebrow">enroll passkey</div>
      <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper">Almost in.</h2>
      <p className="mt-3 text-sm text-aegis-mute">
        Signed in as <span className="text-aegis-paper">{session.data?.user.email ?? '…'}</span>.
        Press the button to register this device. You can add more devices later from settings.
      </p>

      <div className="mt-9 space-y-5">
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
          onClick={onEnroll}
          disabled={submitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-aegis-signal px-5 py-3.5 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
        >
          <Fingerprint className="h-4 w-4" />
          {submitting ? 'Enrolling…' : 'Enroll passkey on this device'}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          Your private key never leaves this device.
        </p>
      </div>
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
