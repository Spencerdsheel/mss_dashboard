from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, field_validator

from services.api.dependencies import get_current_claims, get_repository, get_settings
from services.api.exceptions import AuthenticationError
from services.common.logging_config import get_logger
from services.common.repository import DashboardRepository, to_public_dict
from services.common.security import (
    blacklist_token,
    create_access_token,
    generate_reset_token,
    hash_reset_token,
    verify_reset_token,
)
from services.common.settings import Settings

router = APIRouter(prefix="/auth", tags=["auth"])

logger = get_logger(__name__)

# Generic response returned for ALL redeem outcomes — valid, invalid, expired,
# unknown email — so the caller cannot distinguish between them and learns
# nothing about whether a given email or token is registered / valid.
_REDEEM_GENERIC_RESPONSE = {
    "ok": True,
    "message": "If the reset code is valid, your password has been updated.",
}

# S6: Pre-computed dummy reset-token hash used when the requested email does
# not exist (or is inactive).  Running verify_reset_token against it ensures
# the unknown-email path does comparable PBKDF2 work to the known-email path,
# so response timing cannot be used to enumerate valid addresses.
_DUMMY_RESET_HASH: str = hash_reset_token(generate_reset_token())


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordResetRedeemRequest(BaseModel):
    email: str
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.post("/login")
async def login(
    request: LoginRequest,
    repository: DashboardRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    user = await repository.authenticate_user(request.email, request.password)
    if user is None:
        raise AuthenticationError("Invalid email or password")
    return {
        "access_token": create_access_token(user, settings),
        "token_type": "bearer",
        "user": to_public_dict(user),
    }


@router.post("/logout")
async def logout(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, bool]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if settings.redis_url:
            blacklist_token(token, settings.redis_url, settings.jwt_secret)
    return {"ok": True}


@router.get("/me")
async def me(claims=Depends(get_current_claims)) -> dict:
    return {
        "user_id": claims.user_id,
        "email": claims.email,
        "role": claims.role.value,
        "tenant_id": claims.tenant_id,
        "project_ids": list(claims.project_ids),
    }


@router.post("/password-reset/redeem")
async def redeem_password_reset(
    request: PasswordResetRedeemRequest,
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    """Public endpoint: redeem a password-reset code issued by an admin.

    S6 / Enumeration safety: ALWAYS returns the same 200 response body
    regardless of whether the email exists, the token matched, was expired, or
    already consumed.  No different status codes or error messages are returned
    for failure cases.  Raw token and email are never logged.
    """
    # Resolve user by email server-side (never accept user_id from caller).
    user_info = await repository.get_active_user_for_reset(request.email)

    if user_info:
        # Known-email path: attempt to consume the token and update the password.
        # Errors are swallowed — the generic response is always returned so
        # callers cannot probe validity.
        try:
            await repository.consume_password_reset_token(
                user_id=user_info["user_id"],
                raw_token=request.token,
                new_password=request.new_password,
                tenant_id=user_info["tenant_id"],
            )
        except Exception:
            # Log an opaque error without token/email/password.
            logger.error("password_reset_redeem: unexpected error during consume")
    else:
        # S6: Unknown-email path — perform a dummy PBKDF2 verify so both
        # branches do comparable work and timing cannot reveal email existence.
        verify_reset_token(request.token, _DUMMY_RESET_HASH)

    # Always return the same response — do not reveal success/failure.
    return _REDEEM_GENERIC_RESPONSE


# Whitelisted keys that can be read without authentication
_PUBLIC_SETTING_KEYS = {"site_title", "logo_text", "footer_text", "brand_color"}


@router.get("/settings/public/{key}")
async def get_public_setting(
    key: str,
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    if key not in _PUBLIC_SETTING_KEYS:
        raise HTTPException(status_code=404, detail="Setting not found")
    method = getattr(repository, "get_platform_setting", None)
    _defaults = {"site_title": "iSN", "logo_text": "iSN", "footer_text": "iSN Dashboard", "brand_color": "#ff682c"}
    if method is None:
        value = _defaults.get(key)
    else:
        value = await method(key)
    if value is None:
        value = _defaults.get(key, "")
    return {"key": key, "value": value}
