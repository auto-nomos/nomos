import type { IntegrationPack } from '../types.js';
import { actions, templates } from './templates.js';

export const filesystemPack: IntegrationPack = {
  id: 'filesystem',
  name: 'Filesystem',
  templates,
  actions: [...actions],
};
export { actions, templates };
