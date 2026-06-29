"""Tests for services/common/security.py — password hashing, JWT round-trip."""

import time

import pytest

from services.common.security import (
    AuthError,
    create_access_token,
    decode_access_token,
    decode_hs256,
    encode_hs256,
    hash_password,
    verify_password,
)
from services.common.models import Role, User
from services.common.settings import Settings

SECRET = "test-jwt-secret-for-unit-tests-only"
ISSUER = "test-issuer"


def _settings(**overrides):
    defaults = dict(
        jwt_secret=SECRET,
        jwt_issuer=ISSUER,
        jwt_ttl_seconds=3600,
        jwt_audience=None,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _user(role=Role.PLATFORM_ADMIN, tenant_id=None, project_ids=(), company_id=None):
    return User(
        id="u-1",
        email="test@example.com",
        name="Test User",
        role=role,
        tenant_id=tenant_id,
        hashed_password=hash_password("password123"),
        project_ids=project_ids,
        company_id=company_id,
    )


# ── Password hashing ──────────────────────────────────────────────────


class TestPasswordHashing:
    def test_hash_and_verify_round_trip(self):
        pw = "correct-horse-battery-staple"
        stored = hash_password(pw)
        assert verify_password(pw, stored) is True

    def test_wrong_password_fails(self):
        stored = hash_password("correct")
        assert verify_password("wrong", stored) is False

    def test_empty_password_fails(self):
        stored = hash_password("not-empty")
        assert verify_password("", stored) is False

    def test_hash_contains_algorithm_and_iterations(self):
        stored = hash_password("pw", iterations=120_000)
        parts = stored.split("$")
        assert parts[0] == "pbkdf2_sha256"
        assert parts[1] == "120000"

    def test_different_salts_produce_different_hashes(self):
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2  # random salt each time

    def test_malformed_stored_hash_returns_false(self):
        assert verify_password("pw", "not-a-valid-hash") is False
        assert verify_password("pw", "wrong_algo$123$salt$digest") is False


# ── JWT encode/decode ─────────────────────────────────────────────────


class TestJwtRoundTrip:
    def test_encode_decode_preserves_claims(self):
        user = _user(role=Role.PLATFORM_ADMIN, tenant_id="tenant_1", project_ids=("p1", "p2"))
        token = create_access_token(user, _settings(), now=1_000_000)
        claims = decode_access_token(token, _settings(), now=1_000_000)

        assert claims.user_id == "u-1"
        assert claims.role == Role.PLATFORM_ADMIN
        assert claims.tenant_id == "tenant_1"
        assert claims.project_ids == ("p1", "p2")

    def test_expired_token_raises(self):
        user = _user()
        token = create_access_token(user, _settings(), now=1_000_000)
        with pytest.raises(AuthError, match="expired"):
            decode_access_token(token, _settings(), now=1_000_000 + 3601)

    def test_wrong_issuer_raises(self):
        user = _user()
        token = create_access_token(user, _settings(), now=1_000_000)
        with pytest.raises(AuthError, match="issuer"):
            decode_access_token(token, _settings(jwt_issuer="other-issuer"), now=1_000_000)

    def test_tampered_signature_raises(self):
        user = _user()
        token = create_access_token(user, _settings(), now=1_000_000)
        # Flip a character in the signature
        parts = token.split(".")
        parts[2] = parts[2][:-1] + ("A" if parts[2][-1] != "A" else "B")
        tampered = ".".join(parts)
        with pytest.raises(AuthError):
            decode_access_token(tampered, _settings(), now=1_000_000)

    def test_tenant_user_token_without_tenant_id_raises(self):
        user = _user(role=Role.TENANT_USER, tenant_id=None)
        token = create_access_token(user, _settings(), now=1_000_000)
        with pytest.raises(AuthError, match="tenant_id"):
            decode_access_token(token, _settings(), now=1_000_000)

    def test_tenant_user_token_with_tenant_id_succeeds(self):
        user = _user(role=Role.TENANT_USER, tenant_id="tenant_1", project_ids=("p1",))
        token = create_access_token(user, _settings(), now=1_000_000)
        claims = decode_access_token(token, _settings(), now=1_000_000)
        assert claims.role == Role.TENANT_USER
        assert claims.tenant_id == "tenant_1"

    def test_aud_claim_verified_when_configured(self):
        user = _user()
        token = create_access_token(user, _settings(jwt_audience="my-api"), now=1_000_000)
        claims = decode_access_token(token, _settings(jwt_audience="my-api"), now=1_000_000)
        assert claims.user_id == "u-1"

    def test_wrong_aud_raises(self):
        user = _user()
        token = create_access_token(user, _settings(jwt_audience="my-api"), now=1_000_000)
        with pytest.raises(AuthError, match="audience"):
            decode_access_token(token, _settings(jwt_audience="wrong-api"), now=1_000_000)

    def test_encode_hs256_and_decode_hs256_round_trip(self):
        payload = {"sub": "u-1", "role": "ADMIN", "data": "hello"}
        token = encode_hs256(payload, SECRET)
        result = decode_hs256(token, SECRET)
        assert result["sub"] == "u-1"
        assert result["role"] == "ADMIN"
        assert result["data"] == "hello"

    def test_decode_hs256_wrong_secret_raises(self):
        payload = {"sub": "u-1"}
        token = encode_hs256(payload, SECRET)
        with pytest.raises(AuthError):
            decode_hs256(token, "different-secret")

    def test_decode_hs256_malformed_token_raises(self):
        with pytest.raises(AuthError):
            decode_hs256("not.a.jwt", SECRET)
