import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/filesystem';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const filesystemTools: ToolDefinition[] = toolsFromYaml({
  packId: 'filesystem',
  yamlBasename: 'filesystem',
  actionToCommand,
  resourceFor,
});
