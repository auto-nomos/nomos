import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/discord';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const discordTools: ToolDefinition[] = toolsFromYaml({
  packId: 'discord',
  yamlBasename: 'discord',
  actionToCommand,
  resourceFor,
});
