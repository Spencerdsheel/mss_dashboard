"""Sprint 13b — server-side validation of the dashboard-layout JSON body.

The PUT body is untrusted input (`.claude/rules/api-boundary.md`): validate
every field before persisting. Also used by sprint 14's AI-suggestion service
to validate suggested layouts against the same schema before they can be
applied via the same PUT endpoint (`source="ai_suggested"`).

`ALLOWED_WIDGET_TYPES` is this backend's canonical set of known widget types.
It MUST be kept in sync with the frontend's `WIDGET_REGISTRY` keys
(`src/lib/widget-registry.ts`) — the drift-guard test
(`backend_tests/test_allowed_widget_types.py` + a Vitest counterpart) asserts
both sides against the single committed fixture `allowed_widget_types.json`
in this directory, so drift fails CI rather than shipping silently.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, field_validator

_ALLOWED_SIZES = frozenset({"sm", "md", "lg", "xl"})
_MAX_WIDGETS = 24
ALLOWED_LAYOUT_PAGES: frozenset[str] = frozenset({"overview", "locations"})

# Keep in sync with Object.keys(WIDGET_REGISTRY) in src/lib/widget-registry.ts.
# Sprint 19: grown from 8 to 22 entries (the v1 primitive library, spec §4).
# No removals/renames of the original 8 -- no migration needed for saved layouts.
ALLOWED_WIDGET_TYPES: frozenset[str] = frozenset(
    {
        # Original 8 (sprint 13a/14)
        "kpi-total-visits",
        "kpi-execution-period",
        "kpi-install-slot",
        "install-donuts",
        "banner-radar",
        "visits-trend",
        "top-locations",
        "photo-funnel",
        "geo-kpi-cities", "geo-kpi-top-city", "geo-kpi-avg-per-city", "geo-map", "geo-ranked-cities",
        # New in sprint 19 (14 additions)
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
)

_FIXTURE_PATH = Path(__file__).resolve().parent / "allowed_widget_types.json"


def load_allowed_widget_types_fixture() -> list[str]:
    """Load the committed drift-guard fixture (a sorted JSON array of type names)."""
    with _FIXTURE_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_overview_ai_widget_types_fixture() -> list[str]:
    with (Path(__file__).resolve().parent / "overview_ai_widget_types.json").open("r", encoding="utf-8") as f:
        return json.load(f)


class WidgetInstanceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    size: str
    params: dict[str, str | int | float] | None = None

    @field_validator("type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        if v not in ALLOWED_WIDGET_TYPES:
            raise ValueError(f"Unknown widget type '{v}'")
        return v

    @field_validator("size")
    @classmethod
    def _check_size(cls, v: str) -> str:
        if v not in _ALLOWED_SIZES:
            raise ValueError(f"Invalid size '{v}'. Allowed: {sorted(_ALLOWED_SIZES)}")
        return v


class LayoutConfigModel(BaseModel):
    """Validates the `layout` object of a PUT /admin/projects/{id}/dashboard-layout body."""

    model_config = ConfigDict(extra="forbid")

    version: int
    widgets: list[WidgetInstanceModel]

    @field_validator("version")
    @classmethod
    def _check_version(cls, v: int) -> int:
        if v != 1:
            raise ValueError("Unsupported layout version; expected 1")
        return v

    @field_validator("widgets")
    @classmethod
    def _check_widgets(cls, v: list[WidgetInstanceModel]) -> list[WidgetInstanceModel]:
        if not v:
            raise ValueError("widgets must be a non-empty list")
        if len(v) > _MAX_WIDGETS:
            raise ValueError(f"widgets exceeds the max of {_MAX_WIDGETS}")
        return v
