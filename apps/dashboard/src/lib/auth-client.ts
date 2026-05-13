'use client';

import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { clientEnv } from './env';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

export interface SessionData {
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: string | Date };
}

export interface UseSessionResult {
  data: SessionData | null;
  isPending: boolean;
  refetch: () => Promise<void>;
  error: { message?: string; status: number; statusText: string } | null;
}

export interface AuthError {
  code?: string;
  message?: string;
  status?: number;
}

export interface AuthFetchOptions {
  onSuccess?: (ctx: unknown) => void;
  onError?: (ctx: { error: AuthError }) => void;
}

interface AuthClientShape {
  signIn: {
    email: (
      input: { email: string; password: string; rememberMe?: boolean },
      options?: AuthFetchOptions,
    ) => Promise<{ data: SessionData | null; error: AuthError | null }>;
    emailOtp: (
      input: { email: string; otp: string },
      options?: AuthFetchOptions,
    ) => Promise<{ data: SessionData | null; error: AuthError | null }>;
  };
  signUp: {
    email: (
      input: { email: string; password: string; name: string },
      options?: AuthFetchOptions,
    ) => Promise<{ data: SessionData | null; error: AuthError | null }>;
  };
  signOut: () => Promise<{ data: { success: boolean } | null; error: AuthError | null }>;
  useSession: () => UseSessionResult;
  emailOtp: {
    sendVerificationOtp: (input: {
      email: string;
      type: 'sign-in' | 'email-verification' | 'forget-password';
    }) => Promise<{ data: unknown; error: AuthError | null }>;
  };
}

export type AuthClient = AuthClientShape;

// pnpm + TS2742 workaround per feedback_pnpm_ts2742: cast through unknown so
// the inferred return doesn't leak workspace internals.
export const authClient: AuthClient = createAuthClient({
  baseURL: `${clientEnv.controlPlaneUrl}/auth`,
  fetchOptions: { credentials: 'include' },
  plugins: [emailOTPClient()],
}) as unknown as AuthClient;

export const { signIn, signUp, signOut, useSession } = authClient;
