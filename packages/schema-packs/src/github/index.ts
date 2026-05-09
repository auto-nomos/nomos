import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const githubPack: IntegrationPack = {
  id: 'github',
  name: 'GitHub',
  templates,
  actions: [...actions],
};
export { actions, templates };
