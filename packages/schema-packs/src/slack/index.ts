import { generated } from '../__generated__/slack-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const slackPack: IntegrationPack = {
  id: 'slack',
  name: 'Slack',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, {}),
};
export { actions, actionToCommand, resourceFor, templates };
