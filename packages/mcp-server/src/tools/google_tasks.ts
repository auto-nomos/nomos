import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google_tasks';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleTasksTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google_tasks',
  yamlBasename: 'google_tasks',
  actionToCommand,
  resourceFor,
});
