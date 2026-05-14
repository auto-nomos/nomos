import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/ssh';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const sshTools: ToolDefinition[] = toolsFromYaml({
  packId: 'ssh',
  yamlBasename: 'ssh',
  actionToCommand,
  resourceFor,
});
