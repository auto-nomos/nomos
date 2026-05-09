'use client';

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

export interface AuthClient {
  signIn: {
    email: (
      input: { email: string; password: string; rememberMe?: boolean },
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
}

export const authClient: AuthClient = createAuthClient({
  baseURL: `${clientEnv.controlPlaneUrl}/auth`,
  fetchOptions: { credentials: 'include' },
}) as unknown as AuthClient;

export const { signIn, signUp, signOut, useSession } = authClient;
