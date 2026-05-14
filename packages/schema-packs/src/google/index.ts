import { generated } from '../__generated__/google-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleDriveActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googlePack: IntegrationPack = {
  id: 'google',
  name: 'Google',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleDriveActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleDriveActionSchemas,
  resourceFor,
  templates,
};
