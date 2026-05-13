import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const googleSheetsPack: IntegrationPack = {
  id: 'google_sheets',
  name: 'Google Sheets',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
