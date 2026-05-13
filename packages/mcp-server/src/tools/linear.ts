import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/linear';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const linearTools: ToolDefinition[] = toolsFromYaml({
  packId: 'linear',
  yamlBasename: 'linear',
  actionToCommand,
  resourceFor,
});
