"""Prod e2e via Python SDK — drives github_get_user against the live
PDP + control-plane. Skipped unless NOMOS_API_KEY is set so CI doesn't
hit prod.
"""

from __future__ import annotations

import os

import httpx
import pytest

from nomos import AuthGuard

API_KEY = os.environ.get("NOMOS_API_KEY")
CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "https://api.auto-nomos.com")
PDP_URL = os.environ.get("PDP_URL", "https://pdp.auto-nomos.com")

pytestmark = pytest.mark.skipif(
    not API_KEY,
    reason="NOMOS_API_KEY not set — skipping prod e2e",
)


def _mint_ucan(command: str) -> str:
    r = httpx.post(
        f"{CONTROL_PLANE_URL}/v1/mint-ucan",
        json={"commands": [command]},
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=15.0,
    )
    r.raise_for_status()
    body = r.json()
    return body["ucans"][0]["jwt"]


def test_python_sdk_proxy_github_user_read():
    guard = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL)
    ucan = _mint_ucan("/github/user/read")
    result = guard.proxy(
        ucan=ucan,
        command="/github/user/read",
        resource={},
        context={},
        api_call={"method": "GET", "path": "/user"},
    )
    assert result.allow is True, f"denied: {result.decision}"
    assert result.upstream_status == 200, f"upstream {result.upstream_status}"
    body = result.upstream_body
    assert isinstance(body, dict) and "login" in body, f"unexpected upstream body: {body!r}"


def test_python_sdk_proxy_notion_search():
    guard = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL)
    ucan = _mint_ucan("/notion/search")
    result = guard.proxy(
        ucan=ucan,
        command="/notion/search",
        resource={},
        context={},
        api_call={"method": "POST", "path": "/search", "body": {"query": "test", "page_size": 3}},
    )
    assert result.allow is True, f"denied: {result.decision}"
    assert result.upstream_status == 200, f"upstream {result.upstream_status}"
