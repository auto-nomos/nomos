import type { IntegrationPack } from '../types.js';
import { templates } from './templates.js';

export const githubPack: IntegrationPack = {
  id: 'github',
  name: 'GitHub',
  templates,
};
export { templates };
