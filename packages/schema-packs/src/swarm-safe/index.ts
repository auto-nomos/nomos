/**
 * Sprint MAOS-B — swarm-safe Cedar policy templates.
 *
 * These templates exploit the principal attributes that
 * `packages/core/decide.ts` populates from the validated UCAN chain:
 *   - principal.delegationDepth : Long  (0 for root, +1 per hop)
 *   - principal.rootAgent       : String (root agent's DID)
 *   - principal.invokedBy       : Set<String> (every ancestor agent's DID)
 *
 * Templates are integration-agnostic — apply on top of any integration's
 * actions. Picked up by the dashboard policy wizard via SWARM_SAFE_PACK.
 */
import type { IntegrationPack, PolicyTemplate } from '../types.js';

export const SWARM_SAFE_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'swarm:forbid-deep-delegation',
    integrationId: 'swarm',
    name: 'Cap delegation depth',
    description:
      'Forbid any call where the chain depth exceeds 3 — guards against runaway sub-agent fan-out.',
    cedarText: `// Sprint MAOS-B: hard cap on chain depth. Adjust the threshold (3) per swarm.
forbid (
  principal,
  action,
  resource
)
when {
  principal.delegationDepth > 3
};
`,
    visualReady: true,
  },
  {
    id: 'swarm:pin-root-agent',
    integrationId: 'swarm',
    name: 'Pin root agent',
    description:
      'Allow the action only when the chain is rooted at a specific agent. Replace <ROOT_AGENT_DID>.',
    cedarText: `// Sprint MAOS-B: every chain must originate at the named root agent.
permit (
  principal,
  action,
  resource
)
when {
  principal.rootAgent == "<ROOT_AGENT_DID>"
};
`,
    visualReady: true,
  },
  {
    id: 'swarm:block-tainted-ancestor',
    integrationId: 'swarm',
    name: 'Block tainted-ancestor chain',
    description:
      'Forbid the action when any ancestor agent in the chain is on the deny-list. Replace <TAINTED_AGENT_DID>.',
    cedarText: `// Sprint MAOS-B: deny propagation — if any ancestor is tainted, the leaf can't act.
forbid (
  principal,
  action,
  resource
)
when {
  principal.invokedBy.contains("<TAINTED_AGENT_DID>")
};
`,
    visualReady: false,
  },
  {
    id: 'swarm:require-direct-call',
    integrationId: 'swarm',
    name: 'Require direct (non-delegated) call',
    description:
      'Allow the action only when there is no delegation chain (root-only). Useful for sensitive ops.',
    cedarText: `// Sprint MAOS-B: belt-and-braces — only root agents may run this action.
forbid (
  principal,
  action,
  resource
)
when {
  principal.delegationDepth > 0
};
`,
    visualReady: true,
  },
];

export const swarmSafePack: IntegrationPack = {
  id: 'swarm',
  name: 'Swarm-Safe (cross-integration)',
  templates: SWARM_SAFE_TEMPLATES,
  actions: [],
};
