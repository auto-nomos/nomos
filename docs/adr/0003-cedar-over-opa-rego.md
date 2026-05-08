# 0003. Cedar (not OPA Rego) for the policy language

Date: 2026-05-09
Status: accepted

## Context

We need a policy evaluation language for the PDP. Customers will eventually author policies via a visual builder; power users will edit raw text. The language must support attribute-based access control, set membership, and time/context conditions.

Two real options surfaced: AWS Cedar and Open Policy Agent's Rego.

## Decision

Use Cedar for all policy authoring and evaluation. Wrapped in `packages/cedar` over `@cedar-policy/cedar-wasm`.

## Consequences

**Positive:**
- **Formal analysis built-in.** Cedar policies can be statically validated against a schema and proven not to grant unintended access. Rego has no equivalent first-class story.
- **Cleaner attribute model.** `resource.customer_id == "ACME"` is the natural shape for our use case. Rego's data model is JSON-document-oriented and forces a layer of mapping for the same expressivity.
- **AWS-maintained, official Rust core.** WASM bindings are first-party, low-risk, well-audited. Native Rust core gives us a credible Phase 2 path to a Rust PDP without rewriting the policy engine.
- **Visual-builder-friendly AST.** Cedar's grammar is small and analyzable; mapping nodes ↔ Cedar source is straightforward. Rego's Turing-complete query model is much harder to surface visually.
- **Stable language.** Cedar's spec moves slowly and conservatively. Rego's surface area expands faster, increasing visual-builder maintenance.

**Negative:**
- Smaller community than OPA. Hiring is easier for Rego engineers. Mitigated by Cedar's smaller surface — onboarding takes hours, not days.
- Fewer prebuilt integrations. We're building schema packs ourselves anyway (Sprint 10).

## Alternatives considered

- **OPA Rego.** Wider adoption, more flexible, but the flexibility cost is real: harder visual builder, weaker formal guarantees, JSON-doc model that doesn't fit our entity-attribute use case. Pass.
- **Casbin.** Lighter-weight RBAC/ABAC framework. Insufficient expressivity for context-aware time-of-day conditions and delegation patterns. Pass.
- **Custom DSL.** Tempting but unjustified. We'd be rebuilding what Cedar already gives us.

## Phase 2/3 trigger

None expected. If a customer demands OPA on-prem, the PDP is modular — add a `packages/module-rego` that conforms to the same `decide`-friendly interface. Default stays Cedar.
