import type { IntegrationId } from '../config.js';
import { githubTools } from './github.js';
import { googleTools } from './google.js';
import { notionTools } from './notion.js';
import { slackTools } from './slack.js';
import type { ToolDefinition } from './types.js';

export type { ToolDefinition } from './types.js';

const REGISTRY: Record<IntegrationId, ToolDefinition[]> = {
  github: githubTools,
  slack: slackTools,
  google: googleTools,
  notion: notionTools,
};

export function toolsFor(integrations: readonly IntegrationId[]): ToolDefinition[] {
  return integrations.flatMap((id) => REGISTRY[id]);
}
