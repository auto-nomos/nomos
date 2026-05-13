import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google_sheets';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleSheetsTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google_sheets',
  yamlBasename: 'google_sheets',
  actionToCommand,
  resourceFor,
});
