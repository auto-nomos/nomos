import { generated } from '../__generated__/linear-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { linearActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const linearPack: IntegrationPack = {
  id: 'linear',
  name: 'Linear',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, linearActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  linearActionSchemas,
  resourceFor,
  templates,
};
