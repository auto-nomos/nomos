import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/github';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const githubTools: ToolDefinition[] = toolsFromYaml({
  packId: 'github',
  yamlBasename: 'github',
  actionToCommand,
  resourceFor,
});
