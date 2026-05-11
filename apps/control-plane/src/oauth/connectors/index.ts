import type { Connector, ConnectorId, ImplementedConnectorId } from '../connector.js';
import { githubConnector } from './github.js';
import { googleConnector } from './google.js';
import { linearConnector } from './linear.js';
import { notionConnector } from './notion.js';
import { slackConnector } from './slack.js';
import { stripeConnector } from './stripe.js';

/**
 * Map of connector ids implemented in the platform. Sprint 5 shipped
 * the first four (github/slack/google/notion); P-CV3 (Clawvisor parity)
 * adds linear + stripe. Calendar reuses the google connector with an
 * extended scope set, surfaced via a separate schema-pack.
 */
export const connectorRegistry: Record<ImplementedConnectorId, Connector> = {
  github: githubConnector,
  slack: slackConnector,
  google: googleConnector,
  notion: notionConnector,
  linear: linearConnector,
  stripe: stripeConnector,
};

export function getConnector(id: ConnectorId): Connector {
  const c = (connectorRegistry as Record<string, Connector | undefined>)[id];
  if (!c) throw new Error(`unknown connector: ${id}`);
  return c;
}

export const ALL_CONNECTOR_IDS: ImplementedConnectorId[] = [
  'github',
  'slack',
  'google',
  'notion',
  'linear',
  'stripe',
];
