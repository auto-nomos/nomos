'use client';

import { type AuthenticationResponseJSON, startAuthentication } from '@simplewebauthn/browser';
import { useEffect, useState } from 'react';
import { type EnvelopeSpec, formatEnvelopeAsk, formatReason } from '../../../lib/format-envelope';
import { registerPasskey } from '../../../lib/passkey-client';
import { trpc } from '../../../lib/trpc';

function isEnvelopeSpec(x: unknown): x is EnvelopeSpec & { kind: 'envelope' } {
  return !!x && typeof x === 'object' && (x as { kind?: unknown }).kind === 'envelope';
}

interface ApproveClientProps {
  approvalId: string;
}

type Status = 'idle' | 'registering' | 'asserting' | 'denying' | 'done' | 'error';

type VariantScope = 'narrow' | 'medium' | 'broad';

export function ApproveClient({ approvalId }: ApproveClientProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'session' | 'standing'>('session');
  const [remember, setRemember] = useState<boolean>(false);
  const [grantScope, setGrantScope] = useState<'exact' | 'any'>('exact');
  const [selectedVariant, setSelectedVariant] = useState<VariantScope | null>(null);

  const approval = trpc.stepup.getApproval.useQuery({ approvalId });

  useEffect(() => {
    if (!approval.data || selectedVariant) return;
    const rec = (approval.data as { recommendedScope?: unknown }).recommendedScope;
    if (rec === 'narrow' || rec === 'medium' || rec === 'broad') {
      setSelectedVariant(rec);
    }
  }, [approval.data, selectedVariant]);

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

  // Both pending (within cosigner window) and awaiting_review (past window
  // but within 7-day review TTL) remain actionable. Only terminal states
  // (approved / denied / expired) hide the action buttons.
  const expiredOrDecided = a.state !== 'pending' && a.state !== 'awaiting_review';
  const isReviewOnly = a.state === 'awaiting_review';

  async function handleRegister() {
    try {
      setStatus('registering');
      setErrorMsg(null);
      await registerPasskey();
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
      const r = await approveMutation.mutateAsync({
        approvalId,
        // biome-ignore lint/suspicious/noExplicitAny: WebAuthn payload is verified server-side; tRPC wire schema uses passthrough.
        response: response as any,
        mode,
        ...(remember
          ? {
              remember: true,
              scope: grantScope,
              ...(selectedVariant ? { selectedVariant } : {}),
            }
          : {}),
      });
      setResultMsg(
        `Approved${remember ? ' & remembered' : ''}. Cosigner expires at ${new Date(r.expiresAt).toLocaleTimeString()}.`,
      );
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
      await denyMutation.mutateAsync({
        approvalId,
        ...(remember ? { remember: true, scope: grantScope } : {}),
      });
      setResultMsg(`Denied${remember ? ' & remembered' : ''}.`);
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
        <h1 className="text-xl font-semibold">Approve App action</h1>
        <p className="text-sm text-zinc-500">Step-up requested by an App in your account.</p>
      </header>

      <dl className="space-y-2 rounded-md border border-zinc-200 p-4 text-sm">
        {isEnvelopeSpec(a.resource) ? (
          <>
            <div>
              <dt className="text-zinc-500">Permission requested</dt>
              <dd className="mt-1 font-medium">{formatEnvelopeAsk(a.resource)}</dd>
              {a.resource.reason && (
                <p className="mt-1 text-xs text-zinc-500">{formatReason(a.resource.reason)}</p>
              )}
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">Show raw spec</summary>
              <pre className="mt-1 rounded bg-zinc-900 p-2 text-zinc-100">
                {JSON.stringify(a.resource, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Command</dt>
              <dd className="font-mono">{a.command}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Resource</dt>
              <dd className="mt-1 rounded bg-zinc-900 p-2 font-mono text-xs text-zinc-100">
                {JSON.stringify(a.resource, null, 2)}
              </dd>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <dt className="text-zinc-500">State</dt>
          <dd className="font-medium">{a.state}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Requested</dt>
          <dd>{new Date(a.requestedAt).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Expires</dt>
          <dd>{new Date(a.expiresAt).toLocaleString()}</dd>
        </div>
        {a.riskScore && (
          <div className="flex justify-between">
            <dt className="text-zinc-500">Risk</dt>
            <dd className="font-medium">
              {a.riskScore === 'high'
                ? '🔴 High'
                : a.riskScore === 'medium'
                  ? '🟡 Medium'
                  : '🟢 Low'}
            </dd>
          </div>
        )}
        {a.riskSummary && (
          <div>
            <dt className="text-zinc-500">Summary</dt>
            <dd className="mt-1 text-zinc-700">{a.riskSummary}</dd>
          </div>
        )}
        {(() => {
          const variants = (a as { cedarVariants?: unknown }).cedarVariants as
            | { narrow?: string; medium?: string; broad?: string }
            | null
            | undefined;
          if (variants && (variants.narrow || variants.medium || variants.broad)) {
            return (
              <fieldset className="rounded-md border border-zinc-200 p-3 text-xs">
                <legend className="px-1 text-xs font-medium text-zinc-500">
                  Cedar policy preview (pick scope to save)
                </legend>
                {(['narrow', 'medium', 'broad'] as const).map((scope) => {
                  const text = variants[scope];
                  if (!text) return null;
                  const label =
                    scope === 'narrow'
                      ? 'Narrow — this exact resource'
                      : scope === 'medium'
                        ? 'Medium — same container (repo / channel / dataset)'
                        : 'Broad — any resource of this action';
                  const isSelected = selectedVariant === scope;
                  return (
                    <label
                      key={scope}
                      className={`mt-2 block cursor-pointer rounded border p-2 ${isSelected ? 'border-zinc-700 bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-700'}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="cedarVariant"
                          value={scope}
                          checked={isSelected}
                          onChange={() => setSelectedVariant(scope)}
                        />
                        <span className="font-medium">{label}</span>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-zinc-900 p-2 font-mono text-xs text-zinc-100">
                        {text}
                      </pre>
                    </label>
                  );
                })}
              </fieldset>
            );
          }
          if (a.cedarPreview) {
            return (
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500">
                  Cedar preview (what would be saved)
                </summary>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-900 p-2 text-zinc-100">
                  {a.cedarPreview}
                </pre>
              </details>
            );
          }
          return null;
        })()}
      </dl>

      {expiredOrDecided ? (
        <p className="rounded bg-zinc-100 p-3 text-sm text-zinc-700">
          This approval is {a.state}. No further action.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {isReviewOnly ? (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
              The original agent call already timed out. Approving now will{' '}
              <strong>save a policy</strong> so the next identical call auto-allows — it can no
              longer resume the original request.
            </p>
          ) : null}
          {isEnvelopeSpec(a.resource) ? (
            <fieldset className="rounded-md border border-zinc-200 p-3 text-sm">
              <legend className="px-1 text-xs font-medium text-zinc-500">Lifetime</legend>
              <label className="mb-2 flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="session"
                  checked={mode === 'session'}
                  onChange={() => setMode('session')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Session</span> — bounded by TTL, expires
                  automatically.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="standing"
                  checked={mode === 'standing'}
                  onChange={() => setMode('standing')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Standing</span> — durable. Stays active until you
                  revoke it from the dashboard.
                </span>
              </label>
            </fieldset>
          ) : null}
          <fieldset className="rounded-md border border-zinc-200 p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-zinc-500">
              Remember this decision
            </legend>
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>
                <span className="font-medium">Remember for next time</span> — saves an agent_grant
                so this exact request auto-{remember ? 'resolves' : 'allows/denies'} without
                prompting.
              </span>
            </label>
            {remember && (
              <div className="ml-6 mt-2 space-y-1">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="grantScope"
                    value="exact"
                    checked={grantScope === 'exact'}
                    onChange={() => setGrantScope('exact')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">This resource only</span> —{' '}
                    <code className="text-xs">{JSON.stringify(a.resource).slice(0, 60)}</code>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="grantScope"
                    value="any"
                    checked={grantScope === 'any'}
                    onChange={() => setGrantScope('any')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Any resource</span> — every future call to{' '}
                    <code className="text-xs">{a.command}</code>
                  </span>
                </label>
              </div>
            )}
          </fieldset>
          <button
            type="button"
            onClick={handleApprove}
            disabled={status !== 'idle'}
            className="rounded-md bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {status === 'asserting'
              ? 'Approving…'
              : remember
                ? grantScope === 'any'
                  ? 'Always allow (any resource)'
                  : 'Always allow (this resource)'
                : mode === 'standing'
                  ? 'Approve as standing grant'
                  : 'Allow once'}
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
            {status === 'denying'
              ? 'Denying…'
              : remember
                ? grantScope === 'any'
                  ? 'Always deny (any resource)'
                  : 'Always deny (this resource)'
                : 'Deny once'}
          </button>
        </div>
      )}

      {errorMsg && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
      {resultMsg && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{resultMsg}</p>}
    </div>
  );
}
