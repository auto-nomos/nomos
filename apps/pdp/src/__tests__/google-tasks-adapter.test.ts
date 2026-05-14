import type { GoogleTasksConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateGoogleTasksProxyCall } from '../adapters/google_tasks.js';

describe('validateGoogleTasksProxyCall', () => {
  const tasklistConstraint: GoogleTasksConstraint = {
    provider: 'google_tasks',
    tasklist_id: 'list_1',
  };

  it('allows in-scope list on the pinned tasklist', () => {
    expect(
      validateGoogleTasksProxyCall(tasklistConstraint, {
        method: 'GET',
        path: '/lists/list_1/tasks',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects tasks under a different tasklist', () => {
    expect(
      validateGoogleTasksProxyCall(tasklistConstraint, {
        method: 'POST',
        path: '/lists/list_OTHER/tasks',
        body: { title: 't' },
      }),
    ).toEqual({ ok: false, reason: 'tasklist_mismatch' });
  });

  it('task-pinned constraint rejects different task', () => {
    const tc: GoogleTasksConstraint = {
      provider: 'google_tasks',
      tasklist_id: 'list_1',
      task_id: 'task_1',
    };
    expect(
      validateGoogleTasksProxyCall(tc, {
        method: 'DELETE',
        path: '/lists/list_1/tasks/task_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'task_mismatch' });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateGoogleTasksProxyCall(tasklistConstraint, {
        method: 'GET',
        path: '/documents/list_1',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });
});
