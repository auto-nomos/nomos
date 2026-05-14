import type { IntegrationPack } from '../types.js';
import { actions, actionToCommand, resourceFor } from './actions.js';
import { gcpActionSchemas } from './schemas.js';
import { templates } from './templates.js';

export const gcpPack: IntegrationPack = {
  id: 'gcp',
  name: 'GCP',
  templates,
  actions: [...actions],
  actionSchemas: gcpActionSchemas,
};
export { actions, actionToCommand, gcpActionSchemas, resourceFor, templates };
