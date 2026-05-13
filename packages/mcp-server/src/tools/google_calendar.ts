import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google_calendar';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleCalendarTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google_calendar',
  yamlBasename: 'google_calendar',
  actionToCommand,
  resourceFor,
});
