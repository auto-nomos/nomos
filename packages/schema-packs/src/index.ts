export { filesystemPack } from './filesystem/index.js';
export { githubPack } from './github/index.js';
export { googlePack } from './google/index.js';
export { googleCalendarPack } from './google_calendar/index.js';
export { linearPack } from './linear/index.js';
export { notionPack } from './notion/index.js';
export { slackPack } from './slack/index.js';
export { stripePack } from './stripe/index.js';
export * from './types.js';

import { filesystemPack } from './filesystem/index.js';
import { githubPack } from './github/index.js';
import { googlePack } from './google/index.js';
import { googleCalendarPack } from './google_calendar/index.js';
import { linearPack } from './linear/index.js';
import { notionPack } from './notion/index.js';
import { slackPack } from './slack/index.js';
import { stripePack } from './stripe/index.js';
import type { IntegrationId, IntegrationPack, PolicyTemplate } from './types.js';

export const PACKS: IntegrationPack[] = [
  githubPack,
  slackPack,
  googlePack,
  googleCalendarPack,
  notionPack,
  linearPack,
  stripePack,
  filesystemPack,
];

export function listTemplates(): PolicyTemplate[] {
  return PACKS.flatMap((p) => p.templates);
}

export function templatesFor(integrationId: IntegrationId): PolicyTemplate[] {
  return PACKS.find((p) => p.id === integrationId)?.templates ?? [];
}

export function templateById(id: string): PolicyTemplate | undefined {
  return listTemplates().find((t) => t.id === id);
}

export function actionsFor(integrationId: IntegrationId): string[] {
  return PACKS.find((p) => p.id === integrationId)?.actions ?? [];
}
