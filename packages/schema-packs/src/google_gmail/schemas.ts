import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const googleGmailResource = z
  .object({
    user_id: z.string().optional(),
    message_id: z.string().optional(),
    thread_id: z.string().optional(),
    label_id: z.string().optional(),
  })
  .passthrough();

const ALL = [
  '/google/gmail/message/list',
  '/google/gmail/message/read',
  '/google/gmail/message/send',
  '/google/gmail/message/modify',
  '/google/gmail/message/trash',
  '/google/gmail/thread/list',
  '/google/gmail/thread/read',
  '/google/gmail/label/list',
  '/google/gmail/draft/create',
  '/google/gmail/profile/read',
];

export const googleGmailActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  ALL.map((cmd) => [cmd, { resourceSchema: googleGmailResource }]),
);
