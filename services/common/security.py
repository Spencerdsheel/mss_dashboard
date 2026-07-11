from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

import redis

from .models import AuthClaims, Role, User, resolve_role
from .settings import Settings


class AuthError(Exception):
    """Raised when authentication or token validation fails."""


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def hash_password(password: str, *, iterations: int = 120_000) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_b64url_encode(salt)}${_b64url_encode(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = _b64url_decode(salt_text)
        expected = _b64url_decode(digest_text)
    except (ValueError, TypeError):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def create_access_token(
    user: User,
    settings: Settings,
    *,
    now: int | None = None,
) -> str:
    issued_at = int(time.time() if now is None else now)
    payload: dict[str, Any] = {
        "iss": settings.jwt_issuer,
        "sub": user.id,
        "email": user.email,
        "tenant_id": user.tenant_id,
        "role": user.role.value,
        "project_ids": list(user.project_ids),
        "company_id": user.company_id,
        "tenant_ids": list(user.tenant_ids),
        "jti": str(uuid.uuid4()),
        "iat": issued_at,
        "exp": issued_at + settings.jwt_ttl_seconds,
    }
    # S7: Include `aud` claim when JWT_AUDIENCE is configured.
    # Enforcement is symmetric — decode_access_token will verify it if set.
    # Existing deployments without JWT_AUDIENCE set are unaffected.
    if settings.jwt_audience:
        payload["aud"] = settings.jwt_audience
    return encode_hs256(payload, settings.jwt_secret)


_blacklist_clients: dict[str, redis.Redis] = {}


def _get_blacklist_client(redis_url: str) -> redis.Redis:
    """Return a shared Redis client for blacklist operations (one per URL)."""
    client = _blacklist_clients.get(redis_url)
    if client is None:
        client = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
        _blacklist_clients[redis_url] = client
    return client


def blacklist_token(token: str, redis_url: str, jwt_secret: str, ttl_seconds: int | None = None) -> None:
    """Add a token to the Redis blacklist using its JTI claim."""
    try:
        client = _get_blacklist_client(redis_url)
        payload = decode_hs256(token, jwt_secret)
        jti = payload.get("jti")
        if not jti:
            return
        exp = payload.get("exp", 0)
        if ttl_seconds is None:
            ttl_seconds = max(0, int(exp) - int(time.time()))
        if ttl_seconds > 0:
            client.setex(f"jwt_blacklist:{jti}", ttl_seconds, "1")
    except Exception:
        pass  # Fail silently - blacklist is best-effort


def is_token_blacklisted(token: str, redis_url: str, jwt_secret: str) -> bool:
    """Check if a token's JTI is in the Redis blacklist."""
    try:
        client = _get_blacklist_client(redis_url)
        payload = decode_hs256(token, jwt_secret)
        jti = payload.get("jti")
        if not jti:
            return False
        return client.exists(f"jwt_blacklist:{jti}") == 1
    except Exception:
        return False  # If Redis fails, don't block valid tokens


def encode_hs256(payload: dict[str, Any], secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        [
            _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    signature = hmac.new(
        secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(
    token: str,
    settings: Settings,
    *,
    now: int | None = None,
    redis_url: str | None = None,
    jwt_secret: str | None = None,
) -> AuthClaims:
    payload = decode_hs256(token, settings.jwt_secret)
    current_time = int(time.time() if now is None else now)

    if payload.get("iss") != settings.jwt_issuer:
        raise AuthError("Invalid token issuer")
    if int(payload.get("exp", 0)) < current_time:
        raise AuthError("Token has expired")

    # S7: Verify `aud` claim when JWT_AUDIENCE is configured.
    # If the setting is absent the check is skipped, keeping backward
    # compatibility with existing tokens that were issued without `aud`.
    if settings.jwt_audience:
        token_aud = payload.get("aud")
        if token_aud != settings.jwt_audience:
            raise AuthError("Invalid token audience")

    # Check blacklist if Redis is available
    if redis_url and jwt_secret:
        jti = payload.get("jti")
        if jti and is_token_blacklisted(token, redis_url, jwt_secret):
            raise AuthError("Token has been revoked")

    try:
        role = resolve_role(str(payload["role"]))
        project_ids = tuple(str(p) for p in payload.get("project_ids", []))
        tenant_id = payload.get("tenant_id")
        company_id = payload.get("company_id")
        tenant_ids = tuple(str(t) for t in payload.get("tenant_ids", []))

        if role == Role.TENANT_USER and not tenant_id:
            raise AuthError("TENANT_USER token missing required tenant_id claim")

        if role == Role.CLIENT_ADMIN and not company_id:
            raise AuthError("CLIENT_ADMIN token missing required company_id claim")

        if role == Role.CLIENT_ADMIN and not tenant_ids:
            raise AuthError("CLIENT_ADMIN token missing required tenant_ids claim")

        return AuthClaims(
            user_id=str(payload["sub"]),
            email=payload.get("email"),
            role=role,
            tenant_id=str(tenant_id) if tenant_id is not None else None,
            company_id=str(company_id) if company_id is not None else None,
            project_ids=project_ids,
            tenant_ids=tenant_ids,
        )
    except AuthError:
        raise
    except (KeyError, ValueError, TypeError) as exc:
        raise AuthError("Invalid token claims") from exc


# ── Password-reset primitive (Groundwork) ─────────────────────────────────
#
# Usage:
#   raw_token = generate_reset_token()        # give this to the user (email)
#   token_hash = hash_reset_token(raw_token)  # store only this in the DB
#
#   # Later, when the user submits the token:
#   if verify_reset_token(submitted_token, stored_hash):
#       # consume the row and set a new PBKDF2 password hash
#
# The raw token is never stored. The DB row carries only the hash, expiry, and
# consumed_at timestamp. The consuming repository method must atomically set
# consumed_at and update the user's hashed_password in a single transaction.
#
# See: services/common/postgres_repository.py
#      issue_password_reset_token() / consume_password_reset_token()

_RESET_TOKEN_BYTES = 32          # 256 bits of entropy
_RESET_TOKEN_ITERATIONS = 100_000  # PBKDF2 iterations for the stored token hash


def generate_reset_token() -> str:
    """Return a cryptographically random URL-safe token string.

    This value must be delivered to the user over a secure out-of-band channel
    (e.g. email link) and must NEVER be stored in plaintext.
    """
    return base64.urlsafe_b64encode(os.urandom(_RESET_TOKEN_BYTES)).rstrip(b"=").decode("ascii")


def hash_reset_token(raw_token: str) -> str:
    """Return a PBKDF2-SHA256 hash of *raw_token* suitable for DB storage.

    Uses the same format as hash_password so verify_password can be reused,
    but with a different iteration count to make the stored value distinct.
    """
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", raw_token.encode("utf-8"), salt, _RESET_TOKEN_ITERATIONS
    )
    return (
        f"pbkdf2_sha256${_RESET_TOKEN_ITERATIONS}"
        f"${_b64url_encode(salt)}${_b64url_encode(digest)}"
    )


def verify_reset_token(raw_token: str, stored_hash: str) -> bool:
    """Return True if *raw_token* matches *stored_hash* using constant-time comparison."""
    try:
        algorithm, iterations_text, salt_text, digest_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = _b64url_decode(salt_text)
        expected = _b64url_decode(digest_text)
    except (ValueError, TypeError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256", raw_token.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual, expected)


def decode_hs256(token: str, secret: str) -> dict[str, Any]:
    try:
        header_text, payload_text, signature_text = token.split(".", 2)
        header = json.loads(_b64url_decode(header_text))
        payload = json.loads(_b64url_decode(payload_text))
    except (ValueError, TypeError, UnicodeDecodeError, binascii.Error, json.JSONDecodeError) as exc:
        raise AuthError("Malformed token") from exc

    if header.get("alg") != "HS256":
        raise AuthError("Unsupported token algorithm")

    signing_input = f"{header_text}.{payload_text}"
    expected = hmac.new(
        secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        actual = _b64url_decode(signature_text)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise AuthError("Malformed token") from exc
    if not hmac.compare_digest(actual, expected):
        raise AuthError("Invalid token signature")

    if not isinstance(payload, dict):
        raise AuthError("Invalid token payload")
    return payload
