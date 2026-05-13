# claude-subagents-nomos

Reference integration: Claude Code sub-agents authorized through Nomos.

When Claude invokes a sub-agent via the `Task` tool, the orchestrator
mints an attenuated UCAN for the sub-agent and threads
`NOMOS_PARENT_UCAN_CHAIN` into the sub-agent's MCP server environment.
Every PDP call from the sub-agent then includes the full root → leaf
chain.

```ts
import { createAuthGuard, forkChild } from '@auto-nomos/sdk';

const guard = createAuthGuard({ apiKey: process.env.NOMOS_API_KEY!, pdpUrl: ... });

// Parent agent: authorize one call to confirm root UCAN.
const decision = await guard.authorize({
  ucan: rootUcan,
  command: '/github/issue/list',
  resource: { repo: 'org/test-repo' },
  context: {},
});

// Mint attenuated child UCAN via control-plane (out of scope here).
const childUcan = await mintAttenuatedUcan({ /* ... */ });

// Fork — produces env block to merge into the sub-agent's MCP server spawn.
const { env } = forkChild({
  parentChain: [rootUcan],
  childUcanJwt: childUcan,
  parentReceiptId: decision.receiptId,
});

// Spawn sub-agent process with env vars merged.
spawn('node', ['./subagent-mcp-server.js'], { env: { ...process.env, ...env } });
```

The sub-agent's `createAuthGuard()` auto-detects the env and forwards
the chain on every `authorize` / `proxy`.
