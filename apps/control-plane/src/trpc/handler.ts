import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Auth } from '../auth/index.js';
import type { Db } from '../db/index.js';
import type { Logger } from '../logger.js';
import type { RevocationPublisher } from '../services/revocation-publisher.js';
import type { WebAuthnConfig } from '../services/stepup/webauthn.js';
import { createContext } from './context.js';
import { appRouter } from './router.js';

export interface TrpcHandlerDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
  signing: { signKey: Uint8Array; signerDid: string };
  revocationPublisher?: RevocationPublisher;
  webauthn?: WebAuthnConfig;
}

export function handleTrpc(req: Request, deps: TrpcHandlerDeps): Promise<Response> {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createContext(req, {
        db: deps.db,
        auth: deps.auth,
        logger: deps.logger,
        signing: deps.signing,
        ...(deps.revocationPublisher ? { revocationPublisher: deps.revocationPublisher } : {}),
        ...(deps.webauthn ? { webauthn: deps.webauthn } : {}),
      }),
    onError: ({ error, path }) => {
      deps.logger.error({ err: error, path }, 'trpc error');
    },
  });
}
