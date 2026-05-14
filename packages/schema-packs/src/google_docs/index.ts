import { generated } from '../__generated__/google_docs-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleDocsActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleDocsPack: IntegrationPack = {
  id: 'google_docs',
  name: 'Google Docs',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleDocsActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleDocsActionSchemas,
  resourceFor,
  templates,
};
