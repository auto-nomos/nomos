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

## Publish — DO NOT use `npm publish`

The recipe is `pnpm publish -r` from the repo root. `pnpm` rewrites `workspace:*`
ranges to real semver at pack time; `npm publish` ships the literal string and the
tarball fails to install with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`.

Single command (interactive — must be your real terminal, not a non-TTY subprocess):

```sh
pnpm -w build           # build every package first
pnpm test:packs         # pack-smoke verifies tarball layout
pnpm publish -r --access public
```

`pnpm publish` will:
1. Prompt once for your npm 2FA OTP
2. Skip already-published versions
3. Walk the workspace dep graph and publish leaves first
4. Rewrite each `workspace:*` to `^<version>` in the actual tarball

If your terminal is non-interactive (CI), use a granular token + `--no-git-checks`:

```sh
NPM_TOKEN=$(...) pnpm publish -r --access public --no-git-checks
```

### History — what NOT to repeat (2026-05-11)

The original publish ran `npm publish` per-package. All 12 tarballs at v0.0.0 had
literal `workspace:*` in `dependencies` and were uninstallable. Fix recipe:

1. Add a changeset bumping every shippable package to patch (sdk had a pending minor)
2. `pnpm changeset version && pnpm install --lockfile-only`
3. `pnpm test:packs`
4. `pnpm publish -r --access public --no-git-checks` (entered OTP interactively)
5. Deprecate the broken versions:
   ```sh
   read -p "OTP: " OTP
   for p in shared-types crypto cedar ucan schema-packs policy-builder \
            audit-verify adapters core sdk mcp-server cli; do
     npm deprecate "@auto-nomos/$p@0.0.0" \
       "0.0.0 shipped with broken workspace:* deps; use ^0.0.1 (sdk: ^0.1.0)" \
       --otp="$OTP"
   done
   ```

`.changeset/config.json` ignore list must include every workspace package that is
NOT being published (`control-plane`, `pdp`, `dashboard`, `egress-proxy`,
`example-mcp-github`), otherwise `pnpm changeset version` errors when a dependent
references an ignored package.

## Version bumping

```sh
pnpm changeset             # interactive: choose packages + bump kind
pnpm changeset version     # writes new versions into package.json files
pnpm install --lockfile-only
git commit -am "release: bump versions"
```

Then re-run the publish command (`pnpm publish -r --access public`).

Versions currently shipped (2026-05-11): all packages at `0.0.1` except
`@auto-nomos/sdk` at `0.1.0`.

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
