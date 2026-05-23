"""Chain helpers — no network."""

import json

import pytest

from nomos import (
    DEFAULT_MAX_CHAIN_DEPTH,
    ENV_PARENT_CHAIN,
    ENV_PARENT_RECEIPT,
    ENV_SWARM_ID,
    apply_parent_chain,
    fork_child,
    read_parent_chain_from_env,
)


def test_read_parent_chain_from_env_empty():
    ctx = read_parent_chain_from_env(env={})
    assert ctx.chain == []
    assert ctx.parent_receipt_id is None
    assert ctx.swarm_id is None


def test_read_parent_chain_json_array():
    ctx = read_parent_chain_from_env(
        env={
            ENV_PARENT_CHAIN: json.dumps(["jwt1", "jwt2"]),
            ENV_PARENT_RECEIPT: "r-parent",
            ENV_SWARM_ID: "s-1",
        }
    )
    assert ctx.chain == ["jwt1", "jwt2"]
    assert ctx.parent_receipt_id == "r-parent"
    assert ctx.swarm_id == "s-1"


def test_read_parent_chain_csv_fallback():
    ctx = read_parent_chain_from_env(env={ENV_PARENT_CHAIN: "a,b,c"})
    assert ctx.chain == ["a", "b", "c"]


def test_fork_child_appends_leaf_and_emits_env():
    chain, env = fork_child(
        ["root", "mid"],
        "leaf",
        parent_receipt_id="r-parent",
        swarm_id="swarm-7",
    )
    assert chain == ["root", "mid", "leaf"]
    assert env[ENV_PARENT_CHAIN] == json.dumps(chain)
    assert env[ENV_PARENT_RECEIPT] == "r-parent"
    assert env[ENV_SWARM_ID] == "swarm-7"


def test_fork_child_enforces_max_depth():
    with pytest.raises(ValueError):
        fork_child(["a"] * DEFAULT_MAX_CHAIN_DEPTH, "leaf")


def test_apply_parent_chain_when_chain_present():
    out = apply_parent_chain(
        {"ucan": "leaf-jwt", "command": "/x", "resource": {}, "context": {}},
        ctx=type("C", (), {"chain": ["root"], "parent_receipt_id": "rp", "swarm_id": "sw"})(),
    )
    assert out["delegated_chain"] == ["root", "leaf-jwt"]
    assert out["parent_receipt_id"] == "rp"
    assert out["swarm_id"] == "sw"


def test_apply_parent_chain_noop_when_empty():
    req = {"ucan": "leaf", "command": "/x", "resource": {}, "context": {}}
    ctx = type("C", (), {"chain": [], "parent_receipt_id": None, "swarm_id": None})()
    assert apply_parent_chain(req, ctx=ctx) == req


def test_apply_parent_chain_caller_wins():
    req = {
        "ucan": "leaf",
        "delegated_chain": ["explicit-chain"],
        "command": "/x",
        "resource": {},
        "context": {},
    }
    ctx = type("C", (), {"chain": ["env"], "parent_receipt_id": None, "swarm_id": None})()
    assert apply_parent_chain(req, ctx=ctx)["delegated_chain"] == ["explicit-chain"]
