"""Sprint 14 — AI-assisted dashboard layout suggestion tests.

Covers (per the sprint-14 spec and this repo's red lines):
  - admin-gating: TENANT_USER rejected, CLIENT_ADMIN/PLATFORM_ADMIN allowed
    (mirrors the pattern in test_layout_schema.py's TestAdminGating).
  - aggregate-only payload: the request body built for Claude contains ONLY
    the §3.1 allowlist and never raw rows / PII (tenant_id, store/clerk
    names, addresses, individual cities, photo URLs).
  - not-configured path: unset ANTHROPIC_API_KEY raises the typed error the
    route maps to an explicit 503 — never a silent DEFAULT_LAYOUT fallback
    (.claude/rules/sample-data.md §5.2).
  - output validation: a well-formed model response round-trips through
    LayoutConfigModel; a malformed one raises AiSuggestionFailedError after
    the bounded retry.

No pytest-asyncio plugin is installed (see test_dashboard_layout.py), so
async calls are driven via asyncio.run(). The `anthropic` SDK is mocked —
these tests never make a live network call and never require a real API key.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.api.exceptions import AuthorizationError
from services.api.routes.admin import require_client_admin_or_above
from services.api.services.layout_suggestion import (
    AiSuggestionFailedError,
    AiSuggestionsNotConfiguredError,
    _build_aggregate_shape,
    suggest_layout,
)
from services.common.models import (
    AuthClaims,
    DistributionEntry,
    InstallSlot,
    Project,
    ProjectSummary,
    Role,
    Tenant,
)
from services.common.repository import InMemoryDashboardRepository
from services.common.settings import Settings


def _claims(role: Role = Role.CLIENT_ADMIN, tenant_ids: tuple = ("tenant_a",)) -> AuthClaims:
    return AuthClaims(user_id="u1", role=role, tenant_id=None, tenant_ids=tenant_ids)


def _settings(api_key: str | None) -> Settings:
    return Settings(anthropic_api_key=api_key)


def _repo_with_project() -> InMemoryDashboardRepository:
    tenant_a = Tenant(id="tenant_a", name="Tenant A", slug="tenant-a")
    project_a = Project(
        id="proj_a", tenant_id="tenant_a", name="A Project", slug="a", client_name="A"
    )
    return InMemoryDashboardRepository(tenants=[tenant_a], users=[], projects=[project_a])


def _sample_summary() -> ProjectSummary:
    return ProjectSummary(
        project_id="proj_a",
        total_visits=436,
        unique_stores=57,
        min_date="2026-03-06",
        max_date="2026-04-08",
        install_slots=(
            InstallSlot(
                slot_index=1,
                title="Standee Messi",
                question="Was the standee installed?",
                target=100,
                success_count=80,
                distribution=(
                    DistributionEntry(label="Installed", value=80, is_success=True),
                    DistributionEntry(label="Not installed", value=20, is_success=False),
                ),
            ),
        ),
        photo_by_kind={"before": 400, "after": 390},
        rows_with_no_photos=3,
    )


class TestAdminGating:
    def test_tenant_user_rejected(self):
        with pytest.raises(AuthorizationError):
            require_client_admin_or_above(_claims(Role.TENANT_USER))

    def test_client_admin_allowed(self):
        assert require_client_admin_or_above(_claims(Role.CLIENT_ADMIN)) is not None

    def test_platform_admin_allowed(self):
        assert require_client_admin_or_above(_claims(Role.PLATFORM_ADMIN)) is not None


class TestAggregateOnlyPayload:
    """Data-minimization: only the §3.1 allowlist leaves the system."""

    # Sprint 19 widened this shape (project_metrics + data_shape_summary) --
    # see backend_tests/test_ai_full_page_generation.py for the full sprint
    # 19 coverage of the new fields; this file keeps its original sprint 14
    # assertions updated to the current allowlist rather than duplicated.
    _ALLOWED_TOP_LEVEL_KEYS = {
        "project_id",
        "install_slots",
        "total_visits",
        "date_range",
        "city_count",
        "photo_by_kind",
        "project_metrics",
        "data_shape_summary",
        "widget_registry",
    }
    _FORBIDDEN_SUBSTRINGS = (
        "tenant_id",
        "store_name",
        "clerk",
        "address",
        "photo_url",
        "survey_id",
        "instance_id",
    )

    def test_top_level_keys_are_exactly_the_allowlist(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert set(shape.keys()) == self._ALLOWED_TOP_LEVEL_KEYS

    def test_install_slot_fields_are_aggregate_only(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        slot = shape["install_slots"][0]
        assert set(slot.keys()) == {
            "slot_index",
            "title",
            "target",
            "category_count",
            "success_category_count",
        }
        # category_count/success_category_count are counts, not the raw
        # per-visit distribution rows or category labels themselves.
        assert slot["category_count"] == 2
        assert slot["success_category_count"] == 1

    def test_city_count_is_a_number_not_names(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert isinstance(shape["city_count"], int)
        assert shape["city_count"] == 57

    def test_no_pii_or_raw_row_fields_anywhere_in_serialized_payload(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        serialized = json.dumps(shape).lower()
        for forbidden in self._FORBIDDEN_SUBSTRINGS:
            assert forbidden not in serialized, f"leaked forbidden field: {forbidden}"

    def test_no_visit_level_rows_present(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        # Only the aggregate keys — nothing resembling a rows/visits list.
        assert "visits" not in shape
        assert "rows" not in shape
        assert "photos" not in shape

    def test_widget_registry_only_contains_known_types(self):
        from services.common.layout_schema import ALLOWED_WIDGET_TYPES

        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert set(shape["widget_registry"]) <= ALLOWED_WIDGET_TYPES


class TestNotConfiguredPath:
    def test_unset_api_key_raises_not_configured_before_any_anthropic_call(self):
        repo = _repo_with_project()
        settings = _settings(api_key=None)
        with patch("anthropic.AsyncAnthropic") as mock_client_cls:
            with pytest.raises(AiSuggestionsNotConfiguredError):
                asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))
            # Must fail before ever constructing the SDK client — no network
            # call, no silent substitution of DEFAULT_LAYOUT (sample-data §5.2).
            mock_client_cls.assert_not_called()

    def test_empty_string_api_key_is_also_treated_as_unconfigured(self):
        repo = _repo_with_project()
        settings = _settings(api_key="")
        with pytest.raises(AiSuggestionsNotConfiguredError):
            asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))


def _fake_response(payload: dict, stop_reason: str = "end_turn"):
    text_block = SimpleNamespace(type="text", text=json.dumps(payload))
    return SimpleNamespace(stop_reason=stop_reason, content=[text_block])


class TestOutputValidation:
    def test_valid_model_output_round_trips_through_layout_schema(self):
        repo = _repo_with_project()
        settings = _settings(api_key="test-key")
        valid_layout = {
            "version": 1,
            "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}],
        }
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_fake_response(valid_layout))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            result = asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))
        assert result["version"] == 1
        assert result["widgets"][0]["type"] == "kpi-total-visits"
        mock_client.messages.create.assert_called_once()

    def test_malformed_output_retries_once_then_raises(self):
        repo = _repo_with_project()
        settings = _settings(api_key="test-key")
        bad_layout = {"version": 1, "widgets": [{"id": "w1", "type": "not-a-real-type", "size": "sm"}]}
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_fake_response(bad_layout))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            with pytest.raises(AiSuggestionFailedError):
                asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))
        # One bounded retry -> exactly 2 calls, not an unbounded loop.
        assert mock_client.messages.create.call_count == 2

    def test_refusal_stop_reason_retries_once_then_raises(self):
        repo = _repo_with_project()
        settings = _settings(api_key="test-key")
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(
            return_value=_fake_response({}, stop_reason="refusal")
        )
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            with pytest.raises(AiSuggestionFailedError):
                asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))
        assert mock_client.messages.create.call_count == 2

    def test_never_persists_layout(self):
        """The service function must not call upsert_dashboard_layout —
        preview-only, per spec §1/§4.5. Applying is the human's job via the
        existing 13b PUT."""
        repo = _repo_with_project()
        settings = _settings(api_key="test-key")
        valid_layout = {
            "version": 1,
            "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}],
        }
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_fake_response(valid_layout))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            with patch.object(
                repo, "upsert_dashboard_layout", wraps=repo.upsert_dashboard_layout
            ) as spy:
                asyncio.run(suggest_layout(_claims(), "proj_a", repo, settings))
                spy.assert_not_called()
