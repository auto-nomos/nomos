import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google_docs';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleDocsTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google_docs',
  yamlBasename: 'google_docs',
  actionToCommand,
  resourceFor,
});
