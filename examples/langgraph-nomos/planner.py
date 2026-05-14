"""LangGraph planner — root agent in a 3-node Nomos swarm.

The planner runs one direct GitHub call (verifies its own UCAN works),
then forks a child UCAN for the researcher and spawns the researcher as
a subprocess with NOMOS_PARENT_UCAN_CHAIN populated.
"""
from __future__ import annotations

import os
import subprocess
import sys

from nomos import AuthGuard, fork_child

API_KEY = os.environ["NOMOS_API_KEY"]
PDP_URL = os.environ["NOMOS_PDP_URL"]
ROOT_UCAN = os.environ["NOMOS_ROOT_UCAN"]  # minted out-of-band via control-plane.
RESEARCHER_DID = os.environ["NOMOS_RESEARCHER_DID"]
SWARM_ID = os.environ.get("NOMOS_SWARM_ID", "")

guard = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL)

# 1) verify root UCAN authorizes a read on the target repo.
decision = guard.authorize(
    ucan=ROOT_UCAN,
    command="/github/issue/list",
    resource={"repo": "org/test-repo"},
)
print(f"[planner] decision allow={decision.allow} depth={decision.chain_depth} receipt={decision.receipt_id[:8]}")
assert decision.allow, decision.reason

# 2) mint child UCAN via control-plane (out of scope here; pretend we have it).
researcher_ucan = os.environ["NOMOS_RESEARCHER_UCAN"]

# 3) fork child env.
chain, env = fork_child(
    parent_chain=[ROOT_UCAN],
    child_ucan_jwt=researcher_ucan,
    parent_receipt_id=decision.receipt_id,
    swarm_id=SWARM_ID or None,
)
child_env = {**os.environ, **env}
print(f"[planner] forking researcher with chain depth {len(chain)}")
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "researcher.py")], env=child_env, check=True)
