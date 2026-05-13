'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { clientEnv } from './env';

const PASSKEY_BASE = `${clientEnv.controlPlaneUrl}/auth/passkey`;

export interface PasskeyRow {
  id: string;
  name: string | null;
  credentialID: string;
  deviceType: string | null;
  backedUp: boolean | null;
  transports: string | null;
  createdAt: string | Date;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PASSKEY_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `passkey request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

/**
 * Registers a new passkey for the currently signed-in user. Caller must
 * already hold a Better-Auth session (sign-up flow or recovery OTP flow).
 */
export async function registerPasskey(input?: {
  name?: string;
}): Promise<{ credentialId: string }> {
  const options =
    await postJson<Parameters<typeof startRegistration>[0]['optionsJSON']>('/register/options');
  const response = await startRegistration({ optionsJSON: options });
  const verify = await postJson<{ verified: boolean; credentialId: string; error?: string }>(
    '/register/verify',
    { response, name: input?.name },
  );
  if (!verify.verified) {
    throw new Error(verify.error ?? 'passkey registration failed');
  }
  return { credentialId: verify.credentialId };
}

/**
 * Sign in via passkey assertion. When `email` is supplied the server restricts
 * `allowCredentials` to that account; otherwise the browser uses a discoverable
 * credential (usernameless / conditional UI).
 */
export async function authenticatePasskey(input?: {
  email?: string;
  conditionalUI?: boolean;
}): Promise<{ userId: string }> {
  const options = await postJson<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
    '/authenticate/options',
    input?.email ? { email: input.email } : {},
  );
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: input?.conditionalUI === true,
  });
  const verify = await postJson<{ verified: boolean; userId: string; error?: string }>(
    '/authenticate/verify',
    { response },
  );
  if (!verify.verified) {
    throw new Error(verify.error ?? 'passkey authentication failed');
  }
  return { userId: verify.userId };
}

export async function listPasskeys(): Promise<PasskeyRow[]> {
  return postJson<PasskeyRow[]>('/list');
}

export async function deletePasskey(id: string): Promise<{ deleted: boolean }> {
  return postJson<{ deleted: boolean }>('/delete', { id });
}
