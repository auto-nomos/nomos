import { generated } from '../__generated__/google_gmail-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleGmailActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleGmailPack: IntegrationPack = {
  id: 'google_gmail',
  name: 'Gmail',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleGmailActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleGmailActionSchemas,
  resourceFor,
  templates,
};
