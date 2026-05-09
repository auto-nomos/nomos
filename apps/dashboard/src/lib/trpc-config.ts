'use client';

import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { clientEnv } from './env';

export function trpcLinks() {
  return [
    httpBatchLink({
      url: `${clientEnv.controlPlaneUrl}/trpc`,
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: 'include' });
      },
    }),
  ];
}
