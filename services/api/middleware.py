from __future__ import annotations

import uuid
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from services.common.logging_config import set_correlation_id

# S5: Allowed HTTP methods and headers are restricted to what the frontend
# actually uses — not wildcard "*". This limits the attack surface in case a
# malicious origin somehow passes the CORS origin check.
_CORS_ALLOW_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
_CORS_ALLOW_HEADERS = [
    "Authorization",
    "Content-Type",
    "X-Correlation-ID",
    "X-Forwarded-For",
]


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Middleware that generates and propagates correlation IDs."""

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        set_correlation_id(correlation_id)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-correlation-id", correlation_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware that adds security headers to all responses."""

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                security_headers = [
                    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"content-security-policy", b"default-src 'self'"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"x-xss-protection", b"1; mode=block"),
                ]
                headers.extend(security_headers)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


def setup_correlation_id(app: FastAPI) -> None:
    """Add correlation ID middleware to the FastAPI app."""
    app.add_middleware(CorrelationIdMiddleware)


def setup_cors(app: FastAPI, allowed_origins: str | None = None) -> None:
    """Add CORS middleware to allow frontend requests.

    S5: Origins are driven by the CORS_ALLOWED_ORIGINS env setting
    (comma-separated). In development the default is localhost:3000 and
    localhost:3001. Production MUST set CORS_ALLOWED_ORIGINS to the real
    frontend origin(s) — e.g. "https://dashboard.example.com".

    Methods and headers are restricted to what the frontend actually uses
    (not wildcard) to reduce the CORS attack surface.
    """
    if allowed_origins:
        origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
    else:
        origins = ["http://localhost:3000", "http://localhost:3001"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=_CORS_ALLOW_METHODS,
        allow_headers=_CORS_ALLOW_HEADERS,
    )


def setup_security_headers(app: FastAPI) -> None:
    """Add security headers middleware to the FastAPI app."""
    app.add_middleware(SecurityHeadersMiddleware)
