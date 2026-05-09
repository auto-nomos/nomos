import type { IntegrationPack } from '../types.js';
import { templates } from './templates.js';

export const slackPack: IntegrationPack = {
  id: 'slack',
  name: 'Slack',
  templates,
};
export { templates };
