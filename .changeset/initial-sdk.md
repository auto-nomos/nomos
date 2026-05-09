---
'@credential-broker/sdk': minor
---

Initial public surface for the Credential Broker TypeScript SDK:
`createAuthGuard`, `authorize`, `emitReceipt`. Fail-closed by default,
configurable via `failureMode: 'open'`. Retries on 5xx + network errors only;
4xx returns immediately. apiKey format `cb_<customerId>_<secret>`.
