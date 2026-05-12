import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const notionPack: IntegrationPack = {
  id: 'notion',
  name: 'Notion',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
