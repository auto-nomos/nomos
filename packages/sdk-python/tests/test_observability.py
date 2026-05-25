"""Tests for nomos.observability.record_handoff (P1 SDK helper)."""

from __future__ import annotations

from nomos import record_handoff


def test_attaches_typed_handoff_envelope() -> None:
    api_call = {"method": "POST", "path": "/issues"}
    out = record_handoff(
        api_call,
        to_agent_did="did:web:writer.test",
        task="draft notes",
    )
    assert out == {
        "method": "POST",
        "path": "/issues",
        "handoff": {
            "toAgentDid": "did:web:writer.test",
            "task": "draft notes",
        },
    }
    # Pure — input not mutated.
    assert api_call == {"method": "POST", "path": "/issues"}


def test_omits_optional_fields_when_none() -> None:
    out = record_handoff(
        {}, to_agent_did="did:web:writer.test", task="just do it"
    )
    handoff = out["handoff"]
    assert handoff == {
        "toAgentDid": "did:web:writer.test",
        "task": "just do it",
    }
    assert "expectedOutput" not in handoff
    assert "rationale" not in handoff


def test_includes_all_four_fields_when_provided() -> None:
    out = record_handoff(
        {},
        to_agent_did="did:web:writer.test",
        task="draft notes",
        expected_output="<= 200 words markdown",
        rationale="parent is planner; writer owns prose",
    )
    assert out["handoff"] == {
        "toAgentDid": "did:web:writer.test",
        "task": "draft notes",
        "expectedOutput": "<= 200 words markdown",
        "rationale": "parent is planner; writer owns prose",
    }


def test_caller_supplied_handoff_wins() -> None:
    existing = {
        "handoff": {
            "toAgentDid": "did:web:already.test",
            "task": "already declared",
        }
    }
    out = record_handoff(
        existing,
        to_agent_did="did:web:other.test",
        task="would clobber",
    )
    assert out["handoff"]["toAgentDid"] == "did:web:already.test"
    assert out["handoff"]["task"] == "already declared"
