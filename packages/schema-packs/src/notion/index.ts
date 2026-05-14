import { generated } from '../__generated__/notion-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { notionActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const notionPack: IntegrationPack = {
  id: 'notion',
  name: 'Notion',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, notionActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  notionActionSchemas,
  resourceFor,
  templates,
};
