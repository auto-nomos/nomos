'use client';

import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { useState } from 'react';
import { trpc } from '../../../lib/trpc';

interface ApproveClientProps {
  approvalId: string;
}

type Status = 'idle' | 'registering' | 'asserting' | 'denying' | 'done' | 'error';

export function ApproveClient({ approvalId }: ApproveClientProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const approval = trpc.stepup.getApproval.useQuery({ approvalId });
  const registerOptions = trpc.stepup.registerOptions.useMutation();
  const registerVerify = trpc.stepup.registerVerify.useMutation();
  const assertOptions = trpc.stepup.assertOptions.useMutation();
  const approveMutation = trpc.stepup.approve.useMutation();
  const denyMutation = trpc.stepup.deny.useMutation();

  if (approval.isLoading) {
    return <p className="text-sm text-zinc-500">Loading approval…</p>;
  }
  if (approval.error) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Approval not found</h1>
        <p className="text-sm text-zinc-500">{approval.error.message}</p>
      </div>
    );
  }
  const a = approval.data;
  if (!a) return null;

  const expiredOrDecided = a.state !== 'pending';

  async function handleRegister() {
    try {
      setStatus('registering');
      setErrorMsg(null);
      const opts = await registerOptions.mutateAsync();
      const response = (await startRegistration({
        optionsJSON: opts,
      })) as RegistrationResponseJSON;
      // biome-ignore lint/suspicious/noExplicitAny: WebAuthn payload is verified server-side; tRPC wire schema uses passthrough.
      await registerVerify.mutateAsync({ response: response as any });
      setResultMsg('Passkey registered — now click Approve.');
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  }

  async function handleApprove() {
    try {
      setStatus('asserting');
      setErrorMsg(null);
      const { options, hasCredentials } = await assertOptions.mutateAsync({ approvalId });
      if (!hasCredentials) {
        setStatus('idle');
        setErrorMsg('No passkey registered yet — register first.');
        return;
      }
      const response = (await startAuthentication({
        optionsJSON: options,
      })) as AuthenticationResponseJSON;
      // biome-ignore lint/suspicious/noExplicitAny: see registerVerify cast above.
      const r = await approveMutation.mutateAsync({ approvalId, response: response as any });
      setResultMsg(`Approved. Cosigner expires at ${new Date(r.expiresAt).toLocaleTimeString()}.`);
      setStatus('done');
      await approval.refetch();
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  }

  async function handleDeny() {
    try {
      setStatus('denying');
      setErrorMsg(null);
      await denyMutation.mutateAsync({ approvalId });
      setResultMsg('Denied.');
      setStatus('done');
      await approval.refetch();
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Approve agent action</h1>
        <p className="text-sm text-zinc-500">Step-up requested by an agent in your account.</p>
      </header>

      <dl className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Command</dt>
          <dd className="font-mono">{a.command}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Resource</dt>
          <dd className="mt-1 rounded bg-zinc-50 p-2 font-mono text-xs">
            {JSON.stringify(a.resource, null, 2)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">State</dt>
          <dd className="font-medium">{a.state}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Expires</dt>
          <dd>{new Date(a.expiresAt).toLocaleTimeString()}</dd>
        </div>
      </dl>

      {expiredOrDecided ? (
        <p className="rounded bg-zinc-100 p-3 text-sm text-zinc-700">
          This approval is {a.state}. No further action.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={status !== 'idle'}
            className="rounded-md bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {status === 'asserting' ? 'Approving…' : 'Approve with passkey'}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={status !== 'idle'}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-50"
          >
            {status === 'registering' ? 'Registering…' : 'Register passkey'}
          </button>
          <button
            type="button"
            onClick={handleDeny}
            disabled={status !== 'idle'}
            className="rounded-md bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {status === 'denying' ? 'Denying…' : 'Deny'}
          </button>
        </div>
      )}

      {errorMsg && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
      {resultMsg && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{resultMsg}</p>}
    </div>
  );
}
