# Changelog

## 0.1.1 — 2026-05-24

### Fixed
- `_decision_from_json` now parses the `{status, body}` envelope returned by
  PDP `/v1/proxy/:command` instead of treating the body as the raw upstream
  response (commit 8525929).

### Compatibility
- Compatible with `@auto-nomos/mcp-server@0.0.21` and the new audit-root v2
  + signed-anchor genesis flow shipped on the control plane in the
  2026-05-24 security audit.

## 0.1.0 — 2026-05-23

First PyPI release.

### Added
- `AuthGuard.proxy()` — POST `/v1/proxy/:command` for OAuth-borrowed SaaS API calls; never exposes raw tokens to the agent.
- `pdp-synth-<reason>` receipt backfill in `_decision_from_json` so downstream audit always has a non-empty receipt id (mirrors TS SDK fix from 2026-05-12).
- `ProxyResult` dataclass surfaced at package root.
- `py.typed` marker — package now ships PEP 561 type stubs.

### Changed
- Package renamed from `auto-nomos-sdk` to `nomos-sdk` for PyPI publish.
- pyproject upgraded with full classifiers + project.urls for PyPI listing.
