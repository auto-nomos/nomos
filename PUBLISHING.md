# Publishing Nomos packages

The 11 packages under `packages/*` are now scoped `@auto-nomos/*` and ready for npm publish.

## One-time setup

1. Reserve the `@auto-nomos` org on npm (the unscoped `@nomos` was taken):
   ```sh
   npm login
   npm org create auto-nomos
   ```
   (Or `npm org add auto-nomos <username>` if the org already exists.)

   Brand stays Nomos. npm scope is `@auto-nomos/*`. Install command stays brand-y:
   `npm i -g @auto-nomos/cli` then `nomos --help`.

2. Set npm access default to public for scoped packages:
   ```sh
   npm config set access public
   ```

3. (Optional) Issue a granular npm token for CI/release automation; store as `NPM_TOKEN`.

## Pre-flight

Run pack-smoke to confirm every tarball builds and has the expected layout:

```sh
pnpm -w run test:packs
```

This builds + packs:
- `@auto-nomos/sdk`
- `@auto-nomos/mcp-server`
- `@auto-nomos/cli`
- `@auto-nomos/audit-verify`
- `@auto-nomos/adapters`

…and verifies each tarball contains `package.json` + `dist/`. Add more packages to
`scripts/pack-smoke.mts` (`TARGETS`) before publishing them.

## Publish order

Publish dependencies first, then dependents. Each `npm publish --access public` from inside the
package directory.

```sh
# 1. Leaf packages (no internal Nomos deps)
pnpm --filter @auto-nomos/shared-types build && (cd packages/shared-types && npm publish --access public)
pnpm --filter @auto-nomos/crypto       build && (cd packages/crypto       && npm publish --access public)

# 2. Packages that depend only on leaves
pnpm --filter @auto-nomos/cedar          build && (cd packages/cedar          && npm publish --access public)
pnpm --filter @auto-nomos/ucan           build && (cd packages/ucan           && npm publish --access public)
pnpm --filter @auto-nomos/schema-packs   build && (cd packages/schema-packs   && npm publish --access public)
pnpm --filter @auto-nomos/policy-builder build && (cd packages/policy-builder && npm publish --access public)
pnpm --filter @auto-nomos/audit-verify   build && (cd packages/audit-verify   && npm publish --access public)
pnpm --filter @auto-nomos/adapters       build && (cd packages/adapters       && npm publish --access public)

# 3. Packages that compose the above
pnpm --filter @auto-nomos/core       build && (cd packages/core       && npm publish --access public)
pnpm --filter @auto-nomos/sdk        build && (cd packages/sdk-typescript && npm publish --access public)
pnpm --filter @auto-nomos/mcp-server build && (cd packages/mcp-server && npm publish --access public)

# 4. CLI last (bin)
pnpm --filter @auto-nomos/cli build && (cd packages/cli && npm publish --access public)
```

`pnpm publish` resolves `workspace:*` ranges to the actual versions automatically, so the
published `dependencies` look like `"@auto-nomos/crypto": "^0.0.0"` — npm can resolve them once the
leaf packages are on the registry.

## Version bumping

```sh
pnpm changeset             # interactive: choose packages + bump kind
pnpm changeset version     # writes new versions into package.json files
pnpm install --lockfile-only
git commit -am "release: bump versions"
```

Then re-run the publish sequence above.

## After publish

- Smoke-test from a clean dir:
  ```sh
  mkdir /tmp/nomos-smoke && cd /tmp/nomos-smoke && npm init -y
  npm i @auto-nomos/sdk
  node -e "const m = await import('@auto-nomos/sdk'); console.log(Object.keys(m));"
  ```
- Tag the release in git: `git tag v0.1.0 && git push --tags`
- Update https://auto-nomos.com/docs install instructions.

## CLI install (after publish)

```sh
npm i -g @auto-nomos/cli
nomos --help
```

## MCP server install (after publish)

```sh
npx -y @auto-nomos/mcp-server
```

This is what the `nomos connect-agent <client>` templates point at — every wired agent
client downloads the server transparently on first run.
