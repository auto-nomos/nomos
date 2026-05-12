import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { githubActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const githubPack: IntegrationPack = {
  id: 'github',
  name: 'GitHub',
  templates,
  actions: [...actions],
  actionSchemas: githubActionSchemas,
};
export { actions, actionToCommand, githubActionSchemas, resourceFor, templates };
