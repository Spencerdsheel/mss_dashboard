from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx


class ShopmetricsError(Exception):
    """Base error for Shopmetrics extraction failures."""


class ShopmetricsAuthError(ShopmetricsError):
    """Raised when OAuth token retrieval fails."""


class ShopmetricsRequestError(ShopmetricsError):
    """Raised when a Query API call fails permanently."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class HttpResponse:
    status_code: int
    json_body: dict[str, Any]


class Transport(Protocol):
    def post(
        self,
        url: str,
        *,
        data: dict[str, str],
        headers: dict[str, str] | None = None,
        timeout_seconds: int = 30,
    ) -> HttpResponse: ...


class HttpxTransport:
    """Async-compatible HTTP transport using httpx."""

    def post(
        self,
        url: str,
        *,
        data: dict[str, str],
        headers: dict[str, str] | None = None,
        timeout_seconds: int = 30,
    ) -> HttpResponse:
        client = httpx.Client(timeout=timeout_seconds)
        try:
            response = client.post(url, data=data, headers=headers)
            raw = response.text
            payload = json.loads(raw or "{}")
            return HttpResponse(status_code=response.status_code, json_body=payload)
        except httpx.HTTPStatusError as exc:
            raw = exc.response.text
            try:
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                payload = {"error": raw}
            return HttpResponse(status_code=exc.response.status_code, json_body=payload)
        except httpx.TimeoutException as exc:
            raise TimeoutError(str(exc)) from exc
        finally:
            client.close()


@dataclass(frozen=True)
class ShopmetricsCredentials:
    base_url: str
    client_id: str
    client_secret: str

    @property
    def token_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/oauth/connect/token"

    @property
    def execute_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/v2/execute"


@dataclass
class AccessToken:
    value: str
    expires_at: float

    def is_valid(self, now: float | None = None) -> bool:
        current = time.time() if now is None else now
        return self.expires_at - 30 > current


@dataclass
class ShopmetricsClient:
    credentials: ShopmetricsCredentials
    transport: Transport = field(default_factory=HttpxTransport)
    retry_backoff_seconds: tuple[float, ...] = (2.0, 4.0, 8.0)
    timeout_seconds: int = 30
    _access_token: AccessToken | None = None

    def get_access_token(self, *, force_refresh: bool = False) -> str:
        if not force_refresh and self._access_token and self._access_token.is_valid():
            return self._access_token.value

        response = self.transport.post(
            self.credentials.token_url,
            data={
                "client_id": self.credentials.client_id,
                "client_secret": self.credentials.client_secret,
                "grant_type": "client_credentials",
            },
            timeout_seconds=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise ShopmetricsAuthError(
                f"Shopmetrics OAuth failed with status {response.status_code}"
            )

        token_value = response.json_body.get("access_token")
        if not token_value:
            raise ShopmetricsAuthError("Shopmetrics OAuth response did not include access_token")

        expires_in = int(response.json_body.get("expires_in", 1800))
        self._access_token = AccessToken(
            value=str(token_value),
            expires_at=time.time() + expires_in,
        )
        return self._access_token.value

    def execute(self, payload: dict[str, str]) -> dict[str, Any]:
        token = self.get_access_token()
        refreshed_after_401 = False

        for attempt in range(len(self.retry_backoff_seconds) + 1):
            try:
                response = self.transport.post(
                    self.credentials.execute_url,
                    data=payload,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout_seconds=self.timeout_seconds,
                )
            except TimeoutError as exc:
                if attempt >= len(self.retry_backoff_seconds):
                    raise ShopmetricsRequestError("Shopmetrics request timed out") from exc
                self._sleep(attempt)
                continue

            if response.status_code == 401 and not refreshed_after_401:
                token = self.get_access_token(force_refresh=True)
                refreshed_after_401 = True
                continue

            if 500 <= response.status_code <= 599:
                if attempt >= len(self.retry_backoff_seconds):
                    raise ShopmetricsRequestError(
                        f"Shopmetrics request failed after retries with status {response.status_code}",
                        status_code=response.status_code,
                    )
                self._sleep(attempt)
                continue

            if response.status_code >= 400:
                raise ShopmetricsRequestError(
                    f"Shopmetrics request failed with status {response.status_code}",
                    status_code=response.status_code,
                )

            return response.json_body

        raise ShopmetricsRequestError("Shopmetrics request failed unexpectedly")

    def _sleep(self, attempt: int) -> None:
        delay = self.retry_backoff_seconds[attempt]
        if delay > 0:
            time.sleep(delay)


class MockTransport:
    """Deterministic transport for Phase 02 tests and local fixture runs."""

    def __init__(self, responses: list[HttpResponse | Exception]) -> None:
        self.responses = responses
        self.requests: list[dict[str, Any]] = []

    def post(
        self,
        url: str,
        *,
        data: dict[str, str],
        headers: dict[str, str] | None = None,
        timeout_seconds: int = 30,
    ) -> HttpResponse:
        self.requests.append(
            {
                "url": url,
                "data": data,
                "headers": headers or {},
                "timeout_seconds": timeout_seconds,
            }
        )
        if not self.responses:
            raise AssertionError("MockTransport received more requests than expected")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response
