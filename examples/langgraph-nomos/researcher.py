"""Researcher — depth-1 child agent. Reads from GitHub, then forks writer.

NOMOS_PARENT_UCAN_CHAIN is auto-detected by AuthGuard; every authorize
call sends the full root → researcher chain to PDP.
"""
from __future__ import annotations

import os
import subprocess
import sys

from nomos import AuthGuard, fork_child, read_parent_chain_from_env

API_KEY = os.environ["NOMOS_API_KEY"]
PDP_URL = os.environ["NOMOS_PDP_URL"]

guard = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL)
parent_ctx = read_parent_chain_from_env()

# Researcher's own leaf UCAN (already in the chain at slot[-1]); for
# clarity, take it from chain[-1].
own_ucan = parent_ctx.chain[-1]

# Read issues — should allow at depth=1.
decision = guard.authorize(
    ucan=own_ucan,
    command="/github/issue/list",
    resource={"repo": "org/test-repo"},
)
print(f"[researcher] decision allow={decision.allow} depth={decision.chain_depth} receipt={decision.receipt_id[:8]}")
assert decision.allow, decision.reason

# Fork the writer.
writer_ucan = os.environ["NOMOS_WRITER_UCAN"]
chain, env = fork_child(
    parent_chain=parent_ctx.chain,
    child_ucan_jwt=writer_ucan,
    parent_receipt_id=decision.receipt_id,
    swarm_id=parent_ctx.swarm_id,
)
child_env = {**os.environ, **env}
print(f"[researcher] forking writer with chain depth {len(chain)}")
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "writer.py")], env=child_env, check=True)
