import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google',
  yamlBasename: 'google_drive',
  actionToCommand,
  resourceFor,
});
