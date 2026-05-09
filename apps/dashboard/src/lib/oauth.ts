'use client';

import { clientEnv } from './env';

export type ConnectorId = 'github' | 'slack' | 'google' | 'notion';

export interface ConnectInitResponse {
  authUrl: string;
  state: string;
  expiresAt: string;
}

export async function startOAuthConnect(connector: ConnectorId): Promise<ConnectInitResponse> {
  const res = await fetch(`${clientEnv.controlPlaneUrl}/v1/oauth/connect/${connector}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`oauth connect failed (${res.status}): ${body}`);
  }
  return (await res.json()) as ConnectInitResponse;
}
