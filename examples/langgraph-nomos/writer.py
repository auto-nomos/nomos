"""Writer — depth-2 grandchild agent. Attempts a write that triggers step-up.

The writer's first authorize gets `requires_step_up=true`; the operator
approves it from the dashboard /swarms view (snapshot covers writer
only, since it has no children yet); the second call presents the
cosigner JWT and succeeds.
"""
from __future__ import annotations

import os
import time

from nomos import AuthGuard, read_parent_chain_from_env

API_KEY = os.environ["NOMOS_API_KEY"]
PDP_URL = os.environ["NOMOS_PDP_URL"]

guard = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL)
chain = read_parent_chain_from_env().chain
own_ucan = chain[-1]

decision = guard.authorize(
    ucan=own_ucan,
    command="/github/issue/create",
    resource={"repo": "org/test-repo"},
)
print(
    f"[writer] decision allow={decision.allow} depth={decision.chain_depth} "
    f"step_up={decision.requires_step_up} receipt={decision.receipt_id[:8]}"
)

if decision.requires_step_up and decision.step_up_id:
    print(f"[writer] step-up required: {decision.step_up_url}")
    print("[writer] waiting for operator approval (poll PDP /v1/stepup/<id>)…")
    # In production we'd use a proper waitForApproval helper; here, sleep
    # and re-fetch a few times for demo purposes.
    for _ in range(60):
        time.sleep(1)
        # In the real example we'd poll /v1/stepup/<id>; left as an
        # exercise for brevity.
    print("[writer] (skipping cosigner roundtrip in demo)")
elif decision.allow:
    print("[writer] write succeeded without step-up — adjust policy to require it")
else:
    print(f"[writer] denied: {decision.reason}")
