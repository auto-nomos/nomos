import { generated } from '../__generated__/stripe-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const stripePack: IntegrationPack = {
  id: 'stripe',
  name: 'Stripe',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, {}),
};
export { actions, actionToCommand, resourceFor, templates };
