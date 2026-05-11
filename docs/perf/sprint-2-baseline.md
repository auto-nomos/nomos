# Sprint 2 — PDP performance baseline

Recorded 2026-05-09 on the dev machine (Apple Silicon M-series, Node 22.18.0).

## Setup

- PDP built locally (no Fly deploy yet — blocked on Phase 0 chore)
- One synthetic customer with one Cedar policy + one valid UCAN
- All requests target `POST /v1/authorize`
- Audit emit goes to `/tmp/audit.log`
- No OTel exporter, no Sentry — both no-op without env vars

Run command:

```bash
BENCH_DURATION=10 BENCH_CONNECTIONS=50 pnpm --filter @auto-nomos/pdp bench
```

## Numbers (50 conn × 10s, single instance)

| Metric | Value |
|---|---|
| Throughput | ~982 req/s |
| p50 latency | 48 ms |
| p90 latency | ~80 ms |
| p97.5 latency | ~100 ms |
| p99 latency | 107 ms |
| Errors | 0 |
| Timeouts | 0 |

Acceptance: **p99 < 200 ms ✓** (Sprint 2 gate met).

## Distance to Sprint-12 target

Phase 1 final target is **p99 < 50 ms**. Today we are at ~107 ms. The likely contributors:

1. **ed25519 signature verification on every request.** The same UCAN may flow many times in a row; an LRU cache keyed by JWT eliminates the redundant cost. (Sprint 12 hardening pass.)
2. **Cedar wasm cold start per request.** Cedar's WASM is loaded once at module import, but policy parsing happens per `evaluate()` call. Memoizing parsed policies keyed by customer + version will save ~5ms each time. (Sprint 12.)
3. **Audit emit awaits fs.appendFile.** Switching to a write-behind queue (Sprint 8 introduces Postgres + S3 archival) removes this from the hot path.
4. **Cold container at p99.** Once we move to Fly with multiple regions and warm pools (Sprint 11/12), tail latency falls.

None of these are required to pass Sprint 2. Keeping the list as a Sprint-12 punch list.

## Reproducing

The bench script lives at `apps/pdp/bench/baseline.ts`. It:
1. Starts the Hono server on `BENCH_PORT` (default 8788, but our `pnpm bench` defaults are wired through env vars in the script).
2. Pre-loads the policy and revocation caches.
3. Issues a real UCAN with a fresh keypair.
4. Runs `autocannon` with the configured duration + connections.
5. Tears down and exits.

Knobs: `BENCH_DURATION` (seconds), `BENCH_CONNECTIONS`, `BENCH_PORT`.
