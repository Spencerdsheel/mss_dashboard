from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from services.api.exceptions import (
    ApiError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
    RateLimitError,
    ServiceUnavailableError,
    ValidationError,
)
from services.common.logging_config import get_correlation_id, get_logger

logger = get_logger(__name__)


def create_error_response(error: ApiError, status_code: int) -> JSONResponse:
    """Create a standardized JSON error response."""
    correlation_id = get_correlation_id()
    if correlation_id:
        error.correlation_id = correlation_id

    return JSONResponse(
        status_code=status_code,
        content={"error": error.to_dict()},
    )


async def authentication_error_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    logger.warning(f"Authentication error: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_401_UNAUTHORIZED)


async def authorization_error_handler(request: Request, exc: AuthorizationError) -> JSONResponse:
    logger.warning(f"Authorization error: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_403_FORBIDDEN)


async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    logger.info(f"Not found error: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_404_NOT_FOUND)


async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    logger.info(f"Validation error: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_400_BAD_REQUEST)


async def rate_limit_error_handler(request: Request, exc: RateLimitError) -> JSONResponse:
    logger.warning(f"Rate limit exceeded: {exc.error.message}")
    response = create_error_response(exc.error, status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    response.headers["Retry-After"] = str(exc.retry_after)
    return response


async def conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    logger.warning(f"Conflict error: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_409_CONFLICT)


async def service_unavailable_handler(request: Request, exc: ServiceUnavailableError) -> JSONResponse:
    logger.error(f"Service unavailable: {exc.error.message}")
    return create_error_response(exc.error, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle standard HTTP exceptions with consistent error format."""
    error = ApiError(
        code="http_error",
        message=str(exc.detail),
    )
    return create_error_response(error, status_code=exc.status_code)


async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors with detailed error information."""
    errors = []
    for error in exc.errors():
        errors.append(
            {
                "field": ".".join(str(e) for e in error.get("loc", [])),
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type", "value_error"),
            }
        )

    api_error = ApiError(
        code="validation_error",
        message="Request validation failed",
        details={"errors": errors},
    )
    logger.info(f"Request validation failed: {errors}")
    return create_error_response(api_error, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions with a safe error response."""
    correlation_id = get_correlation_id()
    logger.exception(f"Unexpected error (correlation_id={correlation_id}): {exc}")

    error = ApiError(
        code="internal_error",
        message="An unexpected error occurred",
        correlation_id=correlation_id,
    )
    return create_error_response(error, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


def setup_error_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(AuthenticationError, authentication_error_handler)
    app.add_exception_handler(AuthorizationError, authorization_error_handler)
    app.add_exception_handler(NotFoundError, not_found_error_handler)
    app.add_exception_handler(ValidationError, validation_error_handler)
    app.add_exception_handler(RateLimitError, rate_limit_error_handler)
    app.add_exception_handler(ConflictError, conflict_error_handler)
    app.add_exception_handler(ServiceUnavailableError, service_unavailable_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
