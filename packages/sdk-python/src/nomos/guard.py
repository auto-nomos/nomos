"""AuthGuard — minimal Python authorize/proxy client (Sprint MAOS-A).

Mirrors the TS SDK's `createAuthGuard()` for parity with LangGraph /
CrewAI / AutoGen orchestrators. UCAN minting + chain construction is
delegated to the `nomos-ucan` CLI binary; HTTP transport uses httpx.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from .chain import (
    ParentChainContext,
    apply_parent_chain,
    read_parent_chain_from_env,
)

UCAN_BIN = os.environ.get("NOMOS_UCAN_BIN", "nomos-ucan")


@dataclass
class AuthorizeDecision:
    allow: bool
    receipt_id: str
    reason: Optional[str] = None
    obligations: Optional[dict] = None
    requires_step_up: Optional[bool] = None
    step_up_url: Optional[str] = None
    step_up_id: Optional[str] = None
    chain_depth: Optional[int] = None
    attenuation_summary: Optional[dict] = None
    raw: dict = field(default_factory=dict)


def _decision_from_json(body: dict) -> AuthorizeDecision:
    reason = body.get("reason")
    receipt_id = body.get("receiptId") or ""
    # Mirror TS SDK pdp-synth backfill: PDP must always emit a receiptId.
    # When it doesn't (older deploy / proxy synth-deny paths), synthesise
    # one from the reason so downstream audit always has a non-empty id.
    if not receipt_id:
        receipt_id = f"pdp-synth-{reason or 'unknown'}"
    return AuthorizeDecision(
        allow=bool(body.get("allow")),
        receipt_id=str(receipt_id),
        reason=reason,
        obligations=body.get("obligations"),
        requires_step_up=body.get("requiresStepUp"),
        step_up_url=body.get("stepUpUrl"),
        step_up_id=body.get("stepUpId"),
        chain_depth=body.get("chain_depth"),
        attenuation_summary=body.get("attenuation_summary"),
        raw=body,
    )


class AuthGuard:
    """Auth guard for one agent identity.

    Parameters
    ----------
    api_key:
        Nomos API key (`nomos_…`). Customer id is parsed from it.
    pdp_url:
        Base URL of the PDP (e.g. ``https://pdp.example.com``).
    failure_mode:
        ``"closed"`` (deny on PDP unreachable, default) or ``"open"``.
    parent_chain_ctx:
        Override the env-read parent chain context. Tests mostly.
    """

    def __init__(
        self,
        *,
        api_key: str,
        pdp_url: str,
        failure_mode: str = "closed",
        parent_chain_ctx: Optional[ParentChainContext] = None,
        client: Optional[httpx.Client] = None,
    ) -> None:
        self.api_key = api_key
        self.pdp_url = pdp_url.rstrip("/")
        self.failure_mode = failure_mode
        self.customer_id = self._customer_id_from_api_key(api_key)
        self._client = client or httpx.Client(timeout=10.0)
        self._headers = {
            "content-type": "application/json",
            "x-cb-customer": self.customer_id,
            "authorization": f"Bearer {api_key}",
        }
        self._parent_chain_ctx = parent_chain_ctx or read_parent_chain_from_env()

    @staticmethod
    def _customer_id_from_api_key(api_key: str) -> str:
        # API keys are nomos_<customer-uuid>_<secret> in the TS SDK.
        parts = api_key.split("_")
        if len(parts) < 3:
            raise ValueError(f"invalid API key shape: {api_key[:8]}...")
        return parts[1]

    def authorize(
        self,
        *,
        ucan: str,
        command: str,
        resource: dict,
        context: Optional[dict] = None,
        cosigner_jwt: Optional[str] = None,
        traceparent: Optional[str] = None,
    ) -> AuthorizeDecision:
        request: dict[str, Any] = {
            "ucan": ucan,
            "command": command,
            "resource": resource,
            "context": context or {},
        }
        if cosigner_jwt:
            request["cosignerJwt"] = cosigner_jwt
        request = apply_parent_chain(request, self._parent_chain_ctx)
        headers = dict(self._headers)
        if traceparent:
            headers["traceparent"] = traceparent
        try:
            res = self._client.post(
                f"{self.pdp_url}/v1/authorize", json=request, headers=headers
            )
        except httpx.HTTPError:
            return self._fail()
        if res.status_code >= 500:
            return self._fail()
        try:
            return _decision_from_json(res.json())
        except json.JSONDecodeError:
            return AuthorizeDecision(
                allow=self.failure_mode == "open",
                reason="pdp_invalid_response",
                receipt_id="sdk-invalid-response",
            )

    def _fail(self) -> AuthorizeDecision:
        return AuthorizeDecision(
            allow=self.failure_mode == "open",
            reason="pdp_unreachable",
            receipt_id="sdk-fail-closed",
        )

    @dataclass
    class ProxyResult:
        allow: bool
        decision: AuthorizeDecision
        upstream_status: Optional[int] = None
        upstream_body: Optional[Any] = None
        error_code: Optional[str] = None

    def proxy(
        self,
        *,
        ucan: str,
        command: str,
        resource: dict,
        api_call: dict,
        context: Optional[dict] = None,
        cosigner_jwt: Optional[str] = None,
        traceparent: Optional[str] = None,
    ) -> "AuthGuard.ProxyResult":
        """POST /v1/proxy/:command — borrows the OAuth access token from the
        control plane and proxies the SaaS API call so the agent never sees
        raw tokens. `api_call` is `{method, path[, body, query, headers, intent]}`.
        """
        request: dict[str, Any] = {
            "ucan": ucan,
            "command": command,
            "resource": resource,
            "context": context or {},
        }
        if cosigner_jwt:
            request["cosignerJwt"] = cosigner_jwt
        request = apply_parent_chain(request, self._parent_chain_ctx)
        body = {"ucan": ucan, "request": request, "apiCall": api_call}
        headers = dict(self._headers)
        if traceparent:
            headers["traceparent"] = traceparent
        proxy_path = command if command.startswith("/") else f"/{command}"
        try:
            res = self._client.post(
                f"{self.pdp_url}/v1/proxy{proxy_path}", json=body, headers=headers
            )
        except httpx.HTTPError:
            fail = self._fail()
            return AuthGuard.ProxyResult(
                allow=fail.allow, decision=fail, error_code="pdp_unreachable"
            )
        try:
            payload = res.json()
        except json.JSONDecodeError:
            return AuthGuard.ProxyResult(
                allow=self.failure_mode == "open",
                decision=AuthorizeDecision(
                    allow=self.failure_mode == "open",
                    reason="pdp_invalid_response",
                    receipt_id="sdk-invalid-response",
                ),
                upstream_status=res.status_code,
                error_code="pdp_invalid_response",
            )
        decision_obj = payload.get("decision")
        if isinstance(decision_obj, dict):
            decision = _decision_from_json(decision_obj)
        else:
            decision = _decision_from_json(payload)
        return AuthGuard.ProxyResult(
            allow=bool(payload.get("allow", decision.allow)),
            decision=decision,
            upstream_status=res.status_code,
            upstream_body=payload.get("body"),
            error_code=payload.get("error_code"),
        )

    @staticmethod
    def fork_child_via_cli(
        *,
        parent_chain: list[str],
        child_ucan_jwt: str,
        parent_receipt_id: Optional[str] = None,
        swarm_id: Optional[str] = None,
        max_chain_depth: int = 8,
    ) -> tuple[list[str], dict[str, str]]:
        """Shell out to nomos-ucan fork; returns (chain, env_dict).

        Provided for parity with the TS SDK's `forkChild()`. Most callers
        can use the pure-Python `nomos.chain.fork_child` directly.
        """
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(parent_chain, fh)
            chain_path = fh.name
        try:
            args = [
                UCAN_BIN,
                "fork",
                "--parent-chain",
                chain_path,
                "--child-jwt",
                child_ucan_jwt,
                "--max-depth",
                str(max_chain_depth),
            ]
            if parent_receipt_id:
                args += ["--parent-receipt-id", parent_receipt_id]
            if swarm_id:
                args += ["--swarm-id", swarm_id]
            r = subprocess.run(args, capture_output=True, text=True, check=True)
            data = json.loads(r.stdout)
            return data["chain"], data["env"]
        finally:
            os.unlink(chain_path)
