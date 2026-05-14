import { generated } from '../__generated__/google_contacts-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleContactsActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleContactsPack: IntegrationPack = {
  id: 'google_contacts',
  name: 'Google Contacts',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleContactsActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleContactsActionSchemas,
  resourceFor,
  templates,
};
