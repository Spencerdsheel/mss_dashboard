"""Sprint 19 — "Generate overview page (AI)" tests: widened aggregate
payload, the grown 22-widget-type universe, and the platform-admin
on/off toggle.

Extends sprint 14's test_ai_layout_suggestion.py coverage rather than
duplicating it (per spec §1/§3: "one test suite, extended"). Covers:
  - the expanded §5.2 aggregate payload (project_metrics, data_shape_summary)
    still contains no PII/raw rows, and explicitly asserts no per-visit
    metric shape ever appears (spec §7 "Data minimization" red line).
  - the 22-entry ALLOWED_WIDGET_TYPES universe reaching the model prompt.
  - the toggle-off 403 path is distinct (status code AND detail string)
    from the key-unset 503 path -- both from the same route handler.
  - a None/unseeded toggle value is treated as enabled.
  - the settings drift/gating test for the new
    ai_layout_generation_enabled key (admin-only, in _ALL_SETTINGS).

No pytest-asyncio plugin is installed (see test_dashboard_layout.py), so
async calls are driven via asyncio.run().
"""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi import HTTPException

from services.api.routes.admin import (
    _ADMIN_ONLY_SETTINGS,
    _ALL_SETTINGS,
    suggest_dashboard_layout,
)
from services.api.services.layout_suggestion import _build_aggregate_shape
from services.common.layout_schema import ALLOWED_WIDGET_TYPES, load_overview_ai_widget_types_fixture
from services.common.models import (
    AuthClaims,
    DistributionEntry,
    InstallSlot,
    Project,
    ProjectMetric,
    ProjectSummary,
    Role,
    Tenant,
)
from services.common.repository import InMemoryDashboardRepository
from services.common.settings import Settings


def _claims(role: Role = Role.CLIENT_ADMIN, tenant_ids: tuple = ("tenant_a",)) -> AuthClaims:
    return AuthClaims(user_id="u1", role=role, tenant_id=None, tenant_ids=tenant_ids)


def _repo_with_project() -> InMemoryDashboardRepository:
    tenant_a = Tenant(id="tenant_a", name="Tenant A", slug="tenant-a")
    project_a = Project(
        id="proj_a", tenant_id="tenant_a", name="A Project", slug="a", client_name="A"
    )
    return InMemoryDashboardRepository(tenants=[tenant_a], users=[], projects=[project_a])


def _sample_summary(with_metrics: bool = True) -> ProjectSummary:
    metrics = (
        (
            ProjectMetric(key="exec_rate", label="Execution Rate", value=87.0, unit="%", category="target"),
            ProjectMetric(key="avg_photos", label="Avg Photos", value=4.2, unit=None, category="quality"),
        )
        if with_metrics
        else ()
    )
    return ProjectSummary(
        project_id="proj_a",
        total_visits=436,
        unique_stores=57,
        min_date="2026-03-06",
        max_date="2026-04-08",
        metrics=metrics,
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


class TestExpandedAggregatePayload:
    """§5.2: everything sprint 14 sent, plus project_metrics + data_shape_summary."""

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
    # Data minimization (spec §7): no raw rows, PII, or any shape resembling
    # a per-visit metric record. project_metrics is a project-level rollup
    # (dashboard.project_metrics has no survey_id/store_id/visit-level
    # columns -- confirmed against dashboard_schema.sql) so these substrings
    # must never appear anywhere in the serialized payload.
    _FORBIDDEN_SUBSTRINGS = (
        "tenant_id",
        "store_name",
        "clerk",
        "address",
        "photo_url",
        "survey_id",
        "instance_id",
        "visit_id",
        "visit_date",
    )

    def test_top_level_keys_are_exactly_the_widened_allowlist(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert set(shape.keys()) == self._ALLOWED_TOP_LEVEL_KEYS

    def test_project_metrics_uses_real_dataclass_field_names(self):
        # ProjectMetric fields confirmed against services/common/models.py:
        # key, label, value, unit, category (spec §6.1's explicit warning).
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert shape["project_metrics"] == [
            {"key": "exec_rate", "label": "Execution Rate", "category": "target", "unit": "%", "value": 87.0},
            {"key": "avg_photos", "label": "Avg Photos", "category": "quality", "unit": None, "value": 4.2},
        ]

    def test_data_shape_summary_shape_and_values(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert shape["data_shape_summary"] == {
            "has_install_slots": True,
            "install_slot_count": 1,
            "has_photos": True,
            "photo_kind_count": 2,
            "has_metrics": True,
            "metric_count": 2,
            "total_visits": 436,
        }

    def test_data_shape_summary_reflects_empty_project(self):
        empty_summary = ProjectSummary(
            project_id="proj_a",
            total_visits=0,
            unique_stores=0,
            min_date=None,
            max_date=None,
        )
        shape = _build_aggregate_shape(empty_summary, "proj_a")
        assert shape["data_shape_summary"] == {
            "has_install_slots": False,
            "install_slot_count": 0,
            "has_photos": False,
            "photo_kind_count": 0,
            "has_metrics": False,
            "metric_count": 0,
            "total_visits": 0,
        }

    def test_no_pii_or_raw_row_fields_anywhere_in_serialized_payload(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        serialized = json.dumps(shape).lower()
        for forbidden in self._FORBIDDEN_SUBSTRINGS:
            assert forbidden not in serialized, f"leaked forbidden field: {forbidden}"

    def test_no_per_visit_metric_shape_ever_appears(self):
        """Explicit assertion (spec §7) that project_metrics entries are a
        flat aggregate rollup shape only -- never a list/array-of-per-visit
        records nested under a metric."""
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        for metric in shape["project_metrics"]:
            assert set(metric.keys()) == {"key", "label", "category", "unit", "value"}
            assert isinstance(metric["value"], (int, float))

    def test_widget_registry_reflects_the_22_entry_universe(self):
        shape = _build_aggregate_shape(_sample_summary(), "proj_a")
        assert set(shape["widget_registry"]) == set(load_overview_ai_widget_types_fixture())
        assert len(shape["widget_registry"]) == 22


class TestWidgetTypeUniverseGrowth:
    def test_original_eight_still_present(self):
        original_eight = {
            "kpi-total-visits",
            "kpi-execution-period",
            "kpi-install-slot",
            "install-donuts",
            "banner-radar",
            "visits-trend",
            "top-locations",
            "photo-funnel",
        }
        assert original_eight <= set(load_overview_ai_widget_types_fixture())

    def test_all_fourteen_new_types_present(self):
        new_fourteen = {
            "kpi-metric",
            "metrics-bar-list",
            "metrics-grid",
            "install-donut-single",
            "install-bar-compare",
            "install-trend-mini",
            "photo-coverage-donut",
            "photo-kind-bar",
            "visits-heatmap-calendar",
            "visits-summary-band",
            "locations-bar",
            "locations-map-lite",
            "data-coverage-summary",
            "empty-state-note",
        }
        assert new_fourteen <= set(load_overview_ai_widget_types_fixture())
        assert len(new_fourteen) == 14


class TestToggleAndKeyUnsetAreDistinct:
    """The core red-line assertion (spec §7 no-silent-fallback): toggle-off
    -> 403 with a specific message; key-unset -> 503 with a different
    message; a caller/UI must be able to tell them apart, not just detect
    "some 4xx/5xx happened"."""

    def test_toggle_off_raises_403_with_disabled_message(self):
        repo = _repo_with_project()
        asyncio.run(repo.set_platform_setting("ai_layout_generation_enabled", "false"))
        settings = Settings(anthropic_api_key="test-key")  # key IS configured
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a", claims=_claims(), repository=repo, settings=settings
                )
            )
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "AI layout generation is disabled"

    def test_key_unset_raises_503_with_not_configured_message(self):
        repo = _repo_with_project()
        # Toggle left at its default (unseeded -> None -> treated as enabled).
        settings = Settings(anthropic_api_key=None)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a", claims=_claims(), repository=repo, settings=settings
                )
            )
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "AI suggestions not configured"

    def test_responses_are_textually_and_status_distinguishable(self):
        """A caller inspecting only (status_code, detail) must never confuse
        the two paths."""
        repo_toggle_off = _repo_with_project()
        asyncio.run(repo_toggle_off.set_platform_setting("ai_layout_generation_enabled", "false"))
        settings_key_set = Settings(anthropic_api_key="test-key")
        with pytest.raises(HTTPException) as toggle_exc:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a",
                    claims=_claims(),
                    repository=repo_toggle_off,
                    settings=settings_key_set,
                )
            )

        repo_key_unset = _repo_with_project()
        settings_no_key = Settings(anthropic_api_key=None)
        with pytest.raises(HTTPException) as key_exc:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a",
                    claims=_claims(),
                    repository=repo_key_unset,
                    settings=settings_no_key,
                )
            )

        assert toggle_exc.value.status_code != key_exc.value.status_code
        assert toggle_exc.value.detail != key_exc.value.detail

    def test_toggle_check_runs_before_key_check_when_both_would_fail(self):
        """§5.1: check order is intentional -- an admin who disabled the
        feature always sees the disabled message, regardless of whether the
        key happens to be unset too."""
        repo = _repo_with_project()
        asyncio.run(repo.set_platform_setting("ai_layout_generation_enabled", "false"))
        settings = Settings(anthropic_api_key=None)  # ALSO unset
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a", claims=_claims(), repository=repo, settings=settings
                )
            )
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "AI layout generation is disabled"

    def test_unseeded_none_toggle_value_is_treated_as_enabled(self):
        """§6.3: a DB that hasn't re-run the schema SQL yet must not silently
        lose the feature -- None defaults truthy-string, matching the
        seed-default-true decision. We assert this by confirming the
        request proceeds past the toggle check (reaching the key-unset
        check, not the toggle-disabled check)."""
        repo = _repo_with_project()
        # Never call set_platform_setting -- key is absent from both
        # _SETTING_DEFAULTS and the override dict, so get_platform_setting
        # returns None, simulating an unseeded row.
        settings = Settings(anthropic_api_key=None)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a", claims=_claims(), repository=repo, settings=settings
                )
            )
        # Reached the 503 (key-unset) path, not the 403 (disabled) path --
        # proves the None toggle value did not block the request.
        assert exc_info.value.status_code == 503

    def test_toggle_explicitly_true_allows_request_past_the_toggle_check(self):
        repo = _repo_with_project()
        asyncio.run(repo.set_platform_setting("ai_layout_generation_enabled", "true"))
        settings = Settings(anthropic_api_key=None)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                suggest_dashboard_layout(
                    project_id="proj_a", claims=_claims(), repository=repo, settings=settings
                )
            )
        assert exc_info.value.status_code == 503


class TestSettingsDriftAndGating:
    """The new ai_layout_generation_enabled key is admin-only and part of
    the generic settings mechanism -- no new table, no new endpoint."""

    def test_key_is_admin_only(self):
        assert "ai_layout_generation_enabled" in _ADMIN_ONLY_SETTINGS

    def test_key_is_in_all_settings(self):
        assert "ai_layout_generation_enabled" in _ALL_SETTINGS

    def test_settable_and_readable_via_generic_repository_methods(self):
        repo = _repo_with_project()
        asyncio.run(repo.set_platform_setting("ai_layout_generation_enabled", "false"))
        value = asyncio.run(repo.get_platform_setting("ai_layout_generation_enabled"))
        assert value == "false"

    def test_appears_in_get_platform_settings_bulk_read(self):
        repo = _repo_with_project()
        asyncio.run(repo.set_platform_setting("ai_layout_generation_enabled", "false"))
        all_values = asyncio.run(repo.get_platform_settings(list(_ALL_SETTINGS)))
        assert all_values["ai_layout_generation_enabled"] == "false"
