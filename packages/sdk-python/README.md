# auto-nomos-sdk (Python)

Python SDK for Nomos — multi-agent orchestration security.

Mirrors the TS SDK so LangGraph / CrewAI / AutoGen orchestrators get the
same chain-aware authorize / proxy story.

## Install

```bash
pip install auto-nomos-sdk
```

You also need the `nomos-ucan` CLI on PATH for UCAN minting:

```bash
npm install -g @auto-nomos/ucan-cli
```

## Use — root agent

```python
from nomos import AuthGuard

guard = AuthGuard(api_key="nomos_<id>_<secret>", pdp_url="https://pdp.example.com")
decision = guard.authorize(
    ucan="<jwt>",
    command="github:repo:read",
    resource={"repo": "org/test-repo"},
)
if decision.allow:
    ...
```

## Use — fork a child agent (LangGraph / CrewAI / AutoGen)

```python
import subprocess, os, json
from nomos import fork_child, read_parent_chain_from_env

# Inside the parent agent (already authorized once and got a child UCAN
# minted via nomos-ucan or via the control-plane mint endpoint):
chain, env = fork_child(
    parent_chain=read_parent_chain_from_env().chain,
    child_ucan_jwt=child_jwt,
    parent_receipt_id=last_receipt_id,
    swarm_id=swarm_id,
)
subprocess.Popen(["python", "child_agent.py"], env={**os.environ, **env})
```

The child process's `AuthGuard()` automatically picks up
`NOMOS_PARENT_UCAN_CHAIN` and includes the full root → leaf chain on
every authorize / proxy call.

## Env vars (orchestrator-agnostic wire format)

| Var | Purpose |
| --- | --- |
| `NOMOS_PARENT_UCAN_CHAIN` | JSON UCAN array (root-first). |
| `NOMOS_PARENT_UCAN_CHAIN_FILE` | Fallback file path when env exceeds OS limits. |
| `NOMOS_PARENT_RECEIPT_ID` | Causation back-link to parent's last receipt. |
| `NOMOS_SWARM_ID` | Explicit swarm id; PDP otherwise derives. |
| `NOMOS_MAX_CHAIN_DEPTH` | Override depth cap; default 8. |
| `NOMOS_UCAN_BIN` | Path to `nomos-ucan` binary; default `nomos-ucan` on PATH. |
