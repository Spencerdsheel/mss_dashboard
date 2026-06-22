from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ApiError:
    """Standard API error structure."""

    code: str
    message: str
    correlation_id: str | None = None
    details: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        data = {
            "code": self.code,
            "message": self.message,
        }
        if self.correlation_id:
            data["correlation_id"] = self.correlation_id
        if self.details:
            data["details"] = self.details
        return data


class AuthenticationError(Exception):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed"):
        self.error = ApiError(
            code="authentication_failed",
            message=message,
        )


class AuthorizationError(Exception):
    """Raised when user lacks required permissions."""

    def __init__(self, message: str = "Insufficient permissions"):
        self.error = ApiError(
            code="authorization_failed",
            message=message,
        )


class NotFoundError(Exception):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found", resource_type: str | None = None):
        self.error = ApiError(
            code="not_found",
            message=message,
        )
        self.resource_type = resource_type


class ValidationError(Exception):
    """Raised when request validation fails."""

    def __init__(self, message: str = "Validation failed", details: dict[str, Any] | None = None):
        self.error = ApiError(
            code="validation_error",
            message=message,
            details=details,
        )


class RateLimitError(Exception):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60):
        self.error = ApiError(
            code="rate_limit_exceeded",
            message=message,
        )
        self.retry_after = retry_after


class ConflictError(Exception):
    """Raised when a conflict prevents the operation."""

    def __init__(self, message: str = "Resource conflict"):
        self.error = ApiError(
            code="conflict",
            message=message,
        )


class ServiceUnavailableError(Exception):
    """Raised when a dependent service is unavailable."""

    def __init__(self, message: str = "Service temporarily unavailable"):
        self.error = ApiError(
            code="service_unavailable",
            message=message,
        )
