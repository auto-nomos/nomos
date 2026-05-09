import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const notionPack: IntegrationPack = {
  id: 'notion',
  name: 'Notion',
  templates,
  actions: [...actions],
};
export { actions, templates };
