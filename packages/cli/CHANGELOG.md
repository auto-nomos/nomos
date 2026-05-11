# @auto-nomos/cli

## 0.0.1

### Patch Changes

- Republish: the initial 0.0.0 tarballs shipped with literal `workspace:*` strings
  in `dependencies` because they were published via `npm publish` instead of
  `pnpm publish`. npm install rejects `workspace:*` (`EUNSUPPORTEDPROTOCOL`).
  0.0.1 is the same code, republished via `pnpm publish -r` so workspace ranges
  get rewritten to real semver (`^0.0.1`). 0.0.0 versions deprecated on registry.
- Updated dependencies
  - @auto-nomos/adapters@0.0.1
