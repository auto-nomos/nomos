import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const googleDocsPack: IntegrationPack = {
  id: 'google_docs',
  name: 'Google Docs',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
