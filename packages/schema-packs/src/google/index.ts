import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const googlePack: IntegrationPack = {
  id: 'google',
  name: 'Google',
  templates,
  actions: [...actions],
};
export { actions, templates };
