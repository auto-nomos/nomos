import { generated } from '../__generated__/google_tasks-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleTasksActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleTasksPack: IntegrationPack = {
  id: 'google_tasks',
  name: 'Google Tasks',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleTasksActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleTasksActionSchemas,
  resourceFor,
  templates,
};
