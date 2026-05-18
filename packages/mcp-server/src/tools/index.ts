import type { IntegrationId } from '../config.js';
import { azureTools } from './azure.js';
import { filesystemTools } from './filesystem.js';
import { githubTools } from './github.js';
import { googleTools } from './google.js';
import { googleCalendarTools } from './google_calendar.js';
import { googleDocsTools } from './google_docs.js';
import { googleGmailTools } from './google_gmail.js';
import { googleSheetsTools } from './google_sheets.js';
import { googleTasksTools } from './google_tasks.js';
import { linearTools } from './linear.js';
import { notionTools } from './notion.js';
import { slackTools } from './slack.js';
import { sshTools } from './ssh.js';
import { stripeTools } from './stripe.js';
import type { ToolDefinition } from './types.js';

export type { ToolDefinition } from './types.js';

const REGISTRY: Partial<Record<IntegrationId, ToolDefinition[]>> = {
  github: githubTools,
  slack: slackTools,
  google: googleTools,
  notion: notionTools,
  linear: linearTools,
  stripe: stripeTools,
  google_calendar: googleCalendarTools,
  google_gmail: googleGmailTools,
  google_docs: googleDocsTools,
  google_sheets: googleSheetsTools,
  google_tasks: googleTasksTools,
  filesystem: filesystemTools,
  ssh: sshTools,
  azure: azureTools,
};

export function toolsFor(integrations: readonly IntegrationId[]): ToolDefinition[] {
  return integrations.flatMap((id) => REGISTRY[id] ?? []);
}
