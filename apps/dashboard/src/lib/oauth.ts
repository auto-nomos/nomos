'use client';

import { clientEnv } from './env';

export type ConnectorId =
  | 'github'
  | 'slack'
  | 'google'
  | 'notion'
  | 'linear'
  | 'stripe'
  | 'jira'
  | 'salesforce'
  | 'google_calendar'
  | 'google_gmail'
  | 'google_drive'
  | 'google_contacts'
  | 'discord'
  | 'telegram'
  | 'dropbox'
  | 'twilio'
  | 'granola'
  | 'perplexity'
  | 'postgres'
  | 'imessage';

/** Connectors with a working browser OAuth click-through flow. Others
 *  use the manual-token paste path on /connections. */
export const OAUTH_FLOW_CONNECTORS: readonly ConnectorId[] = [
  'github',
  'slack',
  'google',
  'notion',
  'linear',
  'stripe',
];

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
