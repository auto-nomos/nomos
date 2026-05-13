import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const googleTasksPack: IntegrationPack = {
  id: 'google_tasks',
  name: 'Google Tasks',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
