import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/slack';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const slackTools: ToolDefinition[] = toolsFromYaml({
  packId: 'slack',
  yamlBasename: 'slack',
  actionToCommand,
  resourceFor,
});
