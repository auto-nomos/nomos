import type { IntegrationPack } from '../types.js';
import { mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { sshActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const sshPack: IntegrationPack = {
  id: 'ssh',
  name: 'SSH / SFTP',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas({}, sshActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  resourceFor,
  sshActionSchemas,
  templates,
};
