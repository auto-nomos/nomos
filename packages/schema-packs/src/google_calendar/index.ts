import type { IntegrationPack } from '../types.js';
import { actionToCommand, resourceFor } from './actions.js';
import { actions, templates } from './templates.js';

export const googleCalendarPack: IntegrationPack = {
  id: 'google_calendar',
  name: 'Google Calendar',
  templates,
  actions: [...actions],
};
export { actions, actionToCommand, resourceFor, templates };
