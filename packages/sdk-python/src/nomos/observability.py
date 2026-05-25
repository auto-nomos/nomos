"""Sprint MAOS-B / P1 — observability helpers (Python mirror of TS SDK).

``record_handoff`` stamps a typed delegation envelope on the outgoing
``api_call`` dict that the SDK posts to ``/v1/proxy/:command``. PDP
persists it on the parent's terminal span as four flat columns
(``handoff_to_did``, ``handoff_task``, ``handoff_expected_output``,
``handoff_rationale``); the dashboard surfaces it as an edge label in
the swarm action graph and P3 will diff declared-vs-actual handoffs.

Handoff is parent-declared, so it lives on the request that immediately
precedes the fork — NOT on ``fork_child`` (which is child-bound env
wiring). The two surfaces are intentionally separate.
"""

from __future__ import annotations

from typing import Any, Optional, TypedDict


class SpanHandoffEnvelope(TypedDict, total=False):
    """Structured handoff stamped on the outgoing proxy call.

    ``to_agent_did`` and ``task`` are required; the other two fields are
    optional. Length caps are enforced server-side by zod.
    """

    to_agent_did: str
    task: str
    expected_output: str
    rationale: str


def record_handoff(
    api_call: dict[str, Any],
    *,
    to_agent_did: str,
    task: str,
    expected_output: Optional[str] = None,
    rationale: Optional[str] = None,
) -> dict[str, Any]:
    """Return ``api_call`` with a typed ``handoff`` envelope attached.

    Returns a shallow copy — does not mutate the input (callers often
    reuse the api_call across retries). When ``api_call`` already has a
    ``handoff`` key, the caller wins and this function is a no-op.

    Mirrors the TS SDK's ``recordHandoff`` shape. PDP applies no
    authorization side-effects from this field — it is a pure
    observability annotation.
    """
    if "handoff" in api_call and api_call["handoff"]:
        return api_call
    handoff: dict[str, Any] = {
        "toAgentDid": to_agent_did,
        "task": task,
    }
    if expected_output is not None:
        handoff["expectedOutput"] = expected_output
    if rationale is not None:
        handoff["rationale"] = rationale
    return {**api_call, "handoff": handoff}


__all__ = ["SpanHandoffEnvelope", "record_handoff"]
