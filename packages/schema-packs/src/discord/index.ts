import { generated } from '../__generated__/discord-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { discordActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const discordPack: IntegrationPack = {
  id: 'discord',
  name: 'Discord',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, discordActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  discordActionSchemas,
  extractResourceFromApiCall,
  resourceFor,
  templates,
};
