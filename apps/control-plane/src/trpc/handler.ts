import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Auth } from '../auth/index.js';
import type { CredsCache } from '../cloud/creds-cache.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import type { Logger } from '../logger.js';
import type { InviteNotifier } from '../services/invites/notify.js';
import type { TelegramBot } from '../services/notify/telegram-bot.js';
import type { PolicyInvalidator } from '../services/policy-invalidator.js';
import type { RevocationPublisher } from '../services/revocation-publisher.js';
import type { WebAuthnConfig } from '../services/stepup/webauthn.js';
import type { CloudVerifyPoll } from '../workers/cloud-verify-poll.js';
import { createContext } from './context.js';
import { appRouter } from './router.js';

export interface TrpcHandlerDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
  signing: { signKey: Uint8Array; signerDid: string };
  revocationPublisher?: RevocationPublisher;
  policyInvalidator?: PolicyInvalidator;
  webauthn?: WebAuthnConfig;
  oauth?: { config: Config; encryptionKey: Uint8Array };
  telegramBot?: TelegramBot;
  credsCache?: CredsCache;
  cloudVerifyPoll?: CloudVerifyPoll;
  inviteNotifier?: InviteNotifier;
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
        ...(deps.policyInvalidator ? { policyInvalidator: deps.policyInvalidator } : {}),
        ...(deps.webauthn ? { webauthn: deps.webauthn } : {}),
        ...(deps.oauth ? { oauth: deps.oauth } : {}),
        ...(deps.telegramBot ? { telegramBot: deps.telegramBot } : {}),
        ...(deps.credsCache ? { credsCache: deps.credsCache } : {}),
        ...(deps.cloudVerifyPoll ? { cloudVerifyPoll: deps.cloudVerifyPoll } : {}),
        ...(deps.inviteNotifier ? { inviteNotifier: deps.inviteNotifier } : {}),
      }),
    onError: ({ error, path }) => {
      deps.logger.error({ err: error, path }, 'trpc error');
    },
  });
}
