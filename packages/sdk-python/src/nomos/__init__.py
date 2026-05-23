"""Nomos Python SDK — multi-agent orchestration security.

Mirrors the TS SDK's surface for chain-aware agents:
    - AuthGuard: authorize / proxy with auto parent-chain pickup from env.
    - read_parent_chain_from_env: orchestrators that fork sub-agents.
    - fork_child: build env block for a child process.

Heavy lifting (UCAN mint / signature verify) shells out to the
`nomos-ucan` CLI binary. Set `NOMOS_UCAN_BIN` to override the path
(default: `nomos-ucan` on PATH).
"""

from .chain import (
    DEFAULT_MAX_CHAIN_DEPTH,
    ENV_PARENT_CHAIN,
    ENV_PARENT_CHAIN_FILE,
    ENV_PARENT_RECEIPT,
    ENV_SWARM_ID,
    ParentChainContext,
    apply_parent_chain,
    fork_child,
    read_parent_chain_from_env,
)
from .guard import AuthGuard, AuthorizeDecision

ProxyResult = AuthGuard.ProxyResult

__all__ = [
    "AuthGuard",
    "AuthorizeDecision",
    "ProxyResult",
    "DEFAULT_MAX_CHAIN_DEPTH",
    "ENV_PARENT_CHAIN",
    "ENV_PARENT_CHAIN_FILE",
    "ENV_PARENT_RECEIPT",
    "ENV_SWARM_ID",
    "ParentChainContext",
    "apply_parent_chain",
    "fork_child",
    "read_parent_chain_from_env",
]

__version__ = "0.1.0"
