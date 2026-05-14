import { generated } from '../__generated__/google_sheets-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleSheetsActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleSheetsPack: IntegrationPack = {
  id: 'google_sheets',
  name: 'Google Sheets',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleSheetsActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleSheetsActionSchemas,
  resourceFor,
  templates,
};
