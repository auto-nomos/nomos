import type { Connector, ConnectorId, ImplementedConnectorId } from '../connector.js';
import { githubConnector } from './github.js';
import { googleConnector } from './google.js';
import { notionConnector } from './notion.js';
import { slackConnector } from './slack.js';

/**
 * Map of connector ids implemented in Sprint 5. The remaining ids in
 * `ConnectorId` (salesforce, linear, …) land in Sprint 10 — until then
 * `getConnector` throws when called with one.
 */
export const connectorRegistry: Record<ImplementedConnectorId, Connector> = {
  github: githubConnector,
  slack: slackConnector,
  google: googleConnector,
  notion: notionConnector,
};

export function getConnector(id: ConnectorId): Connector {
  const c = (connectorRegistry as Record<string, Connector | undefined>)[id];
  if (!c) throw new Error(`unknown connector: ${id}`);
  return c;
}

export const ALL_CONNECTOR_IDS: ImplementedConnectorId[] = ['github', 'slack', 'google', 'notion'];
