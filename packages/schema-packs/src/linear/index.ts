import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const linearPack: IntegrationPack = {
  id: 'linear',
  name: 'Linear',
  templates,
  actions: [...actions],
};
export { actions, templates };
