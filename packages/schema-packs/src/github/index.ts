import { generated } from '../__generated__/github-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { githubActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const githubPack: IntegrationPack = {
  id: 'github',
  name: 'GitHub',
  templates,
  actions: [...actions],
  // Generated = method+path+required-body floor from github.yaml.
  // Hand-curated tightens semantic body shape (e.g. issue close requires state=closed).
  actionSchemas: mergeActionSchemas(generated, githubActionSchemas),
};
export { actions, actionToCommand, githubActionSchemas, resourceFor, templates };
