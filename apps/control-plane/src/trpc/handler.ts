import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Auth } from '../auth/index.js';
import type { Db } from '../db/index.js';
import type { Logger } from '../logger.js';
import { createContext } from './context.js';
import { appRouter } from './router.js';

export interface TrpcHandlerDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
}

export function handleTrpc(req: Request, deps: TrpcHandlerDeps): Promise<Response> {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req, deps),
    onError: ({ error, path }) => {
      deps.logger.error({ err: error, path }, 'trpc error');
    },
  });
}
