# Changelog

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
