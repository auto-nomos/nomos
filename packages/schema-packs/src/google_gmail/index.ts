import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const googleGmailPack: IntegrationPack = {
  id: 'google_gmail',
  name: 'Gmail',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
