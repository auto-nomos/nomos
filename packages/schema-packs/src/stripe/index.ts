import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const stripePack: IntegrationPack = {
  id: 'stripe',
  name: 'Stripe',
  templates,
  actions: [...actions],
};
export { actions, templates };
