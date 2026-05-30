# Security Policy

Nomos is an authorization and credential-isolation platform — security reports are taken seriously
and handled with priority.

## Reporting a vulnerability

**Do not open a public GitHub issue, pull request, or Discord message for a security vulnerability.**

Report privately via either channel:

- **GitHub Private Vulnerability Reporting** — the preferred path: open the repository's
  **Security → Report a vulnerability** form
  (https://github.com/auto-nomos/nomos/security/advisories/new).
- **Email** — `security@auto-nomos.com`. Encrypt with our PGP key if the details are sensitive
  (request the key in your first message).

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept, affected endpoint/package/version).
- Any suggested remediation.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | within **48 hours** |
| Initial assessment + severity | within **5 business days** |
| Fix or mitigation timeline | communicated after assessment |

We follow **coordinated disclosure**: we'll agree a disclosure date with you, credit you in the
advisory (unless you prefer to remain anonymous), and publish a GitHub Security Advisory + patched
release when the fix ships.

## Scope

In scope:

- The control plane, PDP, dashboard, and OIDC issuer (`apps/*`).
- Published packages under the `@auto-nomos/*` npm scope.
- The hosted product at `app.auto-nomos.com`, `api.auto-nomos.com`, `pdp.auto-nomos.com`,
  `id.auto-nomos.com`.

Out of scope:

- Findings in third-party dependencies that aren't exploitable through Nomos (report upstream).
- Volumetric DoS, social engineering, and reports generated solely by automated scanners with no
  demonstrated impact.

## Safe harbor

Good-faith research that respects user privacy, avoids data destruction, and does not degrade service
for others will not be pursued legally. Test only against your own accounts/organizations.

## Supported versions

Security fixes target the latest released version of each `@auto-nomos/*` package and the current
hosted deployment. Older versions may not receive backports.
