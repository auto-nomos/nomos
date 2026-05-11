# @auto-nomos/sdk

## 0.1.0

### Minor Changes

- 6e6898e: Initial public surface for the Credential Broker TypeScript SDK:
  `createAuthGuard`, `authorize`, `emitReceipt`. Fail-closed by default,
  configurable via `failureMode: 'open'`. Retries on 5xx + network errors only;
  4xx returns immediately. apiKey format `cb_<customerId>_<secret>`.

### Patch Changes

- Republish: the initial 0.0.0 tarballs shipped with literal `workspace:*` strings
  in `dependencies` because they were published via `npm publish` instead of
  `pnpm publish`. npm install rejects `workspace:*` (`EUNSUPPORTEDPROTOCOL`).
  0.0.1 is the same code, republished via `pnpm publish -r` so workspace ranges
  get rewritten to real semver (`^0.0.1`). 0.0.0 versions deprecated on registry.
- Updated dependencies
  - @auto-nomos/shared-types@0.0.1
