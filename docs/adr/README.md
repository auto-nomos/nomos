# Architecture Decision Records (ADRs)

Decisions that shape the architecture of credential-broker live here. Format: [MADR](https://adr.github.io/madr/).

## Why we keep ADRs

Every decision has alternatives we considered and reasons we chose what we chose. Reading the code shows *what*; ADRs show *why*. Future maintainers (including future-you) need both.

## When to write an ADR

- Choosing one technology over another (e.g., Cedar vs OPA, TypeScript vs Rust).
- Reversing an earlier decision.
- Adopting a new architectural pattern that affects multiple packages or apps.
- Anything that contradicts the locked-in stack table in the README or sprint plan.

If a decision is local to one file or one package, it does not need an ADR — a comment or short README suffices.

## Format

Filename: `NNNN-short-kebab-title.md` (zero-padded sequence).

Body:

```markdown
# NNNN. Short Title

Date: YYYY-MM-DD
Status: proposed | accepted | deprecated | superseded by NNNN

## Context
What is the issue motivating this decision?

## Decision
What is the change being proposed or made?

## Consequences
What becomes easier or harder as a result?

## Alternatives considered
What else was on the table, and why was it rejected?
```

## Index

- [0001 — TypeScript not Rust for Phase 1](./0001-typescript-not-rust-for-phase-1.md)
- [0002 — Thin UCAN-v1.0 JWT envelope (not @ucanto in Phase 1)](./0002-thin-ucan-jwt-envelope.md)
- [0003 — Cedar over OPA Rego](./0003-cedar-over-opa-rego.md)
