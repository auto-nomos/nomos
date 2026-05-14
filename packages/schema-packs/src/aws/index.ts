import type { IntegrationPack } from '../types.js';
import { actions, actionToCommand, resourceFor } from './actions.js';
import { awsActionSchemas } from './schemas.js';
import { templates } from './templates.js';

export const awsPack: IntegrationPack = {
  id: 'aws',
  name: 'AWS',
  templates,
  actions: [...actions],
  actionSchemas: awsActionSchemas,
};
export { actions, actionToCommand, awsActionSchemas, resourceFor, templates };
