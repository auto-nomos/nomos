'use client';

import type { Action, Resource, Role } from '@auto-nomos/rbac';
import { trpc } from './trpc';

export interface PermissionsHelper {
  /** True iff the active membership's role can do `action` on `resource`. */
  can: (resource: Resource, action: Action) => boolean;
  /** True while the session/role payload is still loading. Pages should
   *  treat this as "assume denied" rather than flashing buttons that may
   *  disappear once the query resolves. */
  loading: boolean;
  /** Active role for the membership backing the current org. Null when the
   *  user has no membership (shouldn't happen post-signup-hook). */
  role: Role | null;
}

export function usePermissions(): PermissionsHelper {
  const me = trpc.auth.me.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const perms = me.data?.permissions ?? null;
  return {
    can: (resource, action) => {
      const bundle = perms?.[resource];
      return Boolean(bundle?.includes(action));
    },
    loading: me.isPending,
    role: me.data?.activeRole ?? null,
  };
}
