# langgraph-nomos

Reference integration: a 3-agent LangGraph chain authorized through Nomos
with mid-chain step-up.

## Topology

```
planner (root)         ── github:repo:read,write   on org/test-repo
  └── researcher       ── github:repo:read         (attenuated)
        └── writer     ── github:repo:write        (attenuated; needs step-up)
```

## How chain context flows

Each parent node, before invoking its child, calls `nomos-ucan fork`
to mint an attenuated child UCAN and emits the env block:

```
NOMOS_PARENT_UCAN_CHAIN=[<root_jwt>, <researcher_jwt>, <writer_jwt>]
NOMOS_PARENT_RECEIPT_ID=<parent's last receipt>
NOMOS_SWARM_ID=<swarm uuid>
```

Children spawn as subprocesses with these env vars merged. Their SDK
auto-detects and includes the chain on every PDP call.

## Run

```
pip install -e ../../packages/sdk-python
npm install -g ../../packages/ucan-cli
export NOMOS_API_KEY=nomos_<id>_<secret>
export NOMOS_PDP_URL=https://pdp.example.com
python planner.py
```
