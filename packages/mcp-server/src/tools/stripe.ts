import { actionToCommand, resourceFor } from '@auto-nomos/schema-packs/stripe';
import { toolsFromYaml } from './from-yaml.js';
import type { ToolDefinition } from './types.js';

export const stripeTools: ToolDefinition[] = toolsFromYaml({
  packId: 'stripe',
  yamlBasename: 'stripe',
  actionToCommand,
  resourceFor,
});
