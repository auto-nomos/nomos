import { generated } from '../__generated__/notion-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const notionPack: IntegrationPack = {
  id: 'notion',
  name: 'Notion',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, {}),
};
export { actions, actionToCommand, resourceFor, templates };
