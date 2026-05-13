import type { IntegrationId } from '../config.js';
import { githubTools } from './github.js';
import { googleTools } from './google.js';
import { googleCalendarTools } from './google_calendar.js';
import { googleGmailTools } from './google_gmail.js';
import { linearTools } from './linear.js';
import { notionTools } from './notion.js';
import { slackTools } from './slack.js';
import { stripeTools } from './stripe.js';
import type { ToolDefinition } from './types.js';

export type { ToolDefinition } from './types.js';

const REGISTRY: Record<IntegrationId, ToolDefinition[]> = {
  github: githubTools,
  slack: slackTools,
  google: googleTools,
  notion: notionTools,
  linear: linearTools,
  stripe: stripeTools,
  google_calendar: googleCalendarTools,
  google_gmail: googleGmailTools,
};

export function toolsFor(integrations: readonly IntegrationId[]): ToolDefinition[] {
  return integrations.flatMap((id) => REGISTRY[id]);
}
