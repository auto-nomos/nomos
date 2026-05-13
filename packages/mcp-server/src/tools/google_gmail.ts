import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/google_gmail';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const googleGmailTools: ToolDefinition[] = toolsFromYaml({
  packId: 'google_gmail',
  yamlBasename: 'google_gmail',
  actionToCommand,
  resourceFor,
});
