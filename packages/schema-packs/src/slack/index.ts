import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const slackPack: IntegrationPack = {
  id: 'slack',
  name: 'Slack',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
