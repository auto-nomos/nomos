import type { IntegrationPack } from '../types.js';
import { actions, actionToCommand, resourceFor } from './actions.js';
import { azureActionSchemas } from './schemas.js';
import { templates } from './templates.js';

export const azurePack: IntegrationPack = {
  id: 'azure',
  name: 'Azure',
  templates,
  actions: [...actions],
  actionSchemas: azureActionSchemas,
};
export { actions, actionToCommand, azureActionSchemas, resourceFor, templates };
