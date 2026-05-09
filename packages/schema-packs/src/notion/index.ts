import type { IntegrationPack } from '../types.js';
import { templates } from './templates.js';

export const notionPack: IntegrationPack = {
  id: 'notion',
  name: 'Notion',
  templates,
};
export { templates };
