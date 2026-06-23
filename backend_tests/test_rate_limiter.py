"""Tests for services/api/rate_limiter.py — in-memory limiter (no Redis needed)."""

import pytest

from services.api.exceptions import RateLimitError
from services.api.rate_limiter import InMemoryRateLimiter


class TestInMemoryRateLimiter:
    def test_allows_requests_up_to_threshold(self):
        limiter = InMemoryRateLimiter()
        for _ in range(5):
            limiter.check_rate_limit("user-1", "test-endpoint", limit=5, window_seconds=60)

    def test_blocks_request_after_threshold(self):
        limiter = InMemoryRateLimiter()
        for _ in range(3):
            limiter.check_rate_limit("user-1", "test-endpoint", limit=3, window_seconds=60)
        with pytest.raises(RateLimitError) as exc_info:
            limiter.check_rate_limit("user-1", "test-endpoint", limit=3, window_seconds=60)
        assert exc_info.value.error.message == "Rate limit exceeded. Try again in 60 seconds."

    def test_different_keys_are_independent(self):
        limiter = InMemoryRateLimiter()
        # Exhaust limit for user-1
        for _ in range(2):
            limiter.check_rate_limit("user-1", "test-endpoint", limit=2, window_seconds=60)
        # user-2 should still be allowed
        limiter.check_rate_limit("user-2", "test-endpoint", limit=2, window_seconds=60)

    def test_different_endpoints_are_independent(self):
        limiter = InMemoryRateLimiter()
        for _ in range(2):
            limiter.check_rate_limit("user-1", "endpoint-a", limit=2, window_seconds=60)
        # endpoint-b has its own counter
        limiter.check_rate_limit("user-1", "endpoint-b", limit=2, window_seconds=60)

    def test_rate_limit_error_has_retry_after(self):
        limiter = InMemoryRateLimiter()
        for _ in range(1):
            limiter.check_rate_limit("user-1", "test", limit=1, window_seconds=120)
        try:
            limiter.check_rate_limit("user-1", "test", limit=1, window_seconds=120)
        except RateLimitError as e:
            assert e.retry_after == 120
