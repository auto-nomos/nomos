"""Unit tests for the Python SDK. No live PDP needed — uses httpx
MockTransport. Run with: pytest packages/sdk-python/tests."""

from __future__ import annotations

import httpx
import pytest

from nomos import AuthGuard

API_KEY = "nomos_00000000-0000-0000-0000-000000000000_secret"
PDP_URL = "http://pdp.test"


def _client_with(handler):
    transport = httpx.MockTransport(handler)
    return httpx.Client(transport=transport, base_url=PDP_URL)


def test_customer_id_parsed_from_api_key():
    g = AuthGuard(
        api_key=API_KEY,
        pdp_url=PDP_URL,
        client=_client_with(lambda r: httpx.Response(200, json={})),
    )
    assert g.customer_id == "00000000-0000-0000-0000-000000000000"


def test_authorize_returns_decision_with_receipt():
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/authorize"
        assert req.headers["x-cb-customer"] == "00000000-0000-0000-0000-000000000000"
        return httpx.Response(
            200,
            json={"allow": False, "reason": "policy_denied", "receiptId": "abc123"},
        )

    g = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL, client=_client_with(handler))
    d = g.authorize(ucan="x.y.z", command="/github/repo/create", resource={"owner": "o"})
    assert d.allow is False
    assert d.reason == "policy_denied"
    assert d.receipt_id == "abc123"


def test_authorize_synth_receipt_when_missing():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"allow": False, "reason": "malformed_ucan"})

    g = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL, client=_client_with(handler))
    d = g.authorize(ucan="bad", command="/github/repo/create", resource={})
    assert d.allow is False
    assert d.receipt_id == "pdp-synth-malformed_ucan"


def test_authorize_fail_closed_on_5xx():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    g = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL, client=_client_with(handler))
    d = g.authorize(ucan="x.y.z", command="/github/repo/create", resource={})
    assert d.allow is False
    assert d.reason == "pdp_unreachable"
    assert d.receipt_id == "sdk-fail-closed"


def test_authorize_fail_open_when_opted_in():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    g = AuthGuard(
        api_key=API_KEY,
        pdp_url=PDP_URL,
        failure_mode="open",
        client=_client_with(handler),
    )
    d = g.authorize(ucan="x.y.z", command="/github/repo/create", resource={})
    assert d.allow is True
    assert d.reason == "pdp_unreachable"


def test_proxy_returns_result_with_decision_envelope():
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/proxy/github/issue/create"
        body = req.read()
        assert b'"apiCall"' in body and b'"request"' in body
        return httpx.Response(
            403,
            json={
                "allow": False,
                "decision": {
                    "allow": False,
                    "reason": "schema_violation",
                    "receiptId": "r1",
                },
                "error_code": "schema_violation",
            },
        )

    g = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL, client=_client_with(handler))
    r = g.proxy(
        ucan="x.y.z",
        command="/github/issue/create",
        resource={"repo": "x"},
        api_call={"method": "POST", "path": "/repos/x/y/issues", "body": {}},
    )
    assert r.allow is False
    assert r.decision.reason == "schema_violation"
    assert r.decision.receipt_id == "r1"
    assert r.error_code == "schema_violation"
    assert r.upstream_status == 403


def test_proxy_invalid_json_returns_pdp_invalid_response():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>not json</html>")

    g = AuthGuard(api_key=API_KEY, pdp_url=PDP_URL, client=_client_with(handler))
    r = g.proxy(
        ucan="x.y.z",
        command="/github/issue/create",
        resource={},
        api_call={"method": "POST", "path": "/x"},
    )
    assert r.allow is False
    assert r.decision.reason == "pdp_invalid_response"
    assert r.error_code == "pdp_invalid_response"


def test_invalid_api_key_shape_raises():
    with pytest.raises(ValueError):
        AuthGuard(api_key="not-a-real-key", pdp_url=PDP_URL)
