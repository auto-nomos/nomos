import { generated } from '../__generated__/google_calendar-api-schemas.js';
import { type IntegrationPack, mergeActionSchemas } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { extractResourceFromApiCall } from './extract.js';
import { googleCalendarActionSchemas } from './schemas.js';
import { actions, templates } from './templates.js';

export const googleCalendarPack: IntegrationPack = {
  id: 'google_calendar',
  name: 'Google Calendar',
  templates,
  actions: [...actions],
  actionSchemas: mergeActionSchemas(generated, googleCalendarActionSchemas),
  extractResourceFromApiCall,
};
export {
  actions,
  actionToCommand,
  extractResourceFromApiCall,
  googleCalendarActionSchemas,
  resourceFor,
  templates,
};
