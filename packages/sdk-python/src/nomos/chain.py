"""Multi-agent delegation chain helpers (Sprint MAOS-A).

Convention (orchestrator-agnostic, mirrors the TS SDK):
    NOMOS_PARENT_UCAN_CHAIN       — JSON array of UCAN JWTs (root-first).
    NOMOS_PARENT_UCAN_CHAIN_FILE  — fallback path; same JSON shape on disk.
    NOMOS_PARENT_RECEIPT_ID       — receiptId of the parent authorize call.
    NOMOS_SWARM_ID                — explicit swarm hint.

LangGraph / CrewAI / AutoGen agents wire these env vars on child-process
spawn (or via `fork_child()` below) without importing the SDK.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Mapping, Optional

ENV_PARENT_CHAIN = "NOMOS_PARENT_UCAN_CHAIN"
ENV_PARENT_CHAIN_FILE = "NOMOS_PARENT_UCAN_CHAIN_FILE"
ENV_PARENT_RECEIPT = "NOMOS_PARENT_RECEIPT_ID"
ENV_SWARM_ID = "NOMOS_SWARM_ID"
ENV_MAX_CHAIN_DEPTH = "NOMOS_MAX_CHAIN_DEPTH"

DEFAULT_MAX_CHAIN_DEPTH = 8


@dataclass
class ParentChainContext:
    chain: list[str] = field(default_factory=list)
    parent_receipt_id: Optional[str] = None
    swarm_id: Optional[str] = None


def _parse_chain_json(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return [s.strip() for s in raw.split(",") if s.strip()]
    if isinstance(parsed, list) and all(isinstance(s, str) for s in parsed):
        return parsed
    return []


def read_parent_chain_from_env(
    env: Optional[Mapping[str, str]] = None,
) -> ParentChainContext:
    env = env if env is not None else os.environ
    ctx = ParentChainContext()
    raw = env.get(ENV_PARENT_CHAIN)
    if raw:
        ctx.chain = _parse_chain_json(raw)
    else:
        path = env.get(ENV_PARENT_CHAIN_FILE)
        if path:
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    ctx.chain = _parse_chain_json(fh.read())
            except OSError:
                # Silent fallback to empty — caller must tolerate unset env.
                pass
    receipt = env.get(ENV_PARENT_RECEIPT)
    if receipt:
        ctx.parent_receipt_id = receipt
    swarm = env.get(ENV_SWARM_ID)
    if swarm:
        ctx.swarm_id = swarm
    return ctx


def fork_child(
    parent_chain: list[str],
    child_ucan_jwt: str,
    *,
    parent_receipt_id: Optional[str] = None,
    swarm_id: Optional[str] = None,
    max_chain_depth: int = DEFAULT_MAX_CHAIN_DEPTH,
) -> tuple[list[str], dict[str, str]]:
    """Build the chain + env handoff for a child agent.

    Returns (chain, env_dict). env_dict should be merged into the child
    process's environment when spawning (subprocess.Popen, asyncio
    create_subprocess_exec, etc.).
    """
    chain = [*parent_chain, child_ucan_jwt]
    if len(chain) > max_chain_depth:
        raise ValueError(
            f"fork_child: chain depth {len(chain)} exceeds NOMOS_MAX_CHAIN_DEPTH={max_chain_depth}"
        )
    env: dict[str, str] = {ENV_PARENT_CHAIN: json.dumps(chain)}
    if parent_receipt_id:
        env[ENV_PARENT_RECEIPT] = parent_receipt_id
    if swarm_id:
        env[ENV_SWARM_ID] = swarm_id
    return chain, env


def apply_parent_chain(
    request: dict, ctx: Optional[ParentChainContext] = None
) -> dict:
    """Append the local UCAN as leaf onto the parent chain. Caller wins."""
    ctx = ctx if ctx is not None else read_parent_chain_from_env()
    if request.get("delegated_chain"):
        return request
    if not ctx.chain:
        return request
    out = dict(request)
    out["delegated_chain"] = [*ctx.chain, request["ucan"]]
    if "parent_receipt_id" not in out and ctx.parent_receipt_id:
        out["parent_receipt_id"] = ctx.parent_receipt_id
    if "swarm_id" not in out and ctx.swarm_id:
        out["swarm_id"] = ctx.swarm_id
    return out
