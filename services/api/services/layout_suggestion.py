"""Sprint 14/19 — AI-assisted "Generate overview page" dashboard layout
suggestion (domain/service function).

Sprint 19 widens this file in place (spec §1) rather than adding a second
Claude-calling path: same `suggest_layout()` entry point, same
"preview-only, applies via the existing 13b PUT" contract, same exception
pair. What grew: `_build_aggregate_shape` now also sends `project_metrics`
and a `data_shape_summary` (§5.2), and the widget-type universe the model
can pick from grew from 8 to 22 (§4) via `ALLOWED_WIDGET_TYPES`.

Builds an aggregate-only project shape (no raw visit rows, store/clerk
names, addresses, individual cities, photo URLs, or tenant_id), asks Claude
for a proposed `LayoutConfig` constrained to the same JSON schema
`services/common/layout_schema.py` validates against, then re-validates the
model's output server-side before returning it.

This is the ONLY module in the backend that imports the `anthropic` SDK —
`services/api/routes/admin.py` stays a thin handler (service-boundary /
`.claude/rules/service-boundary.md`). The suggestion is preview-only: this
function never persists anything; the admin applies it via the existing
13b `PUT /admin/projects/{id}/dashboard-layout` with `source="ai_suggested"`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import ValidationError

from services.common.layout_schema import LayoutConfigModel, load_overview_ai_widget_types_fixture
from services.common.models import AuthClaims
from services.common.repository import DashboardRepository
from services.common.settings import Settings

_MODEL_ID = "claude-opus-4-8"
_MAX_TOKENS = 4096
_ALLOWED_SIZES = ("sm", "md", "lg", "xl")
_MAX_WIDGETS = 24

# The widget registry sent to Claude so it only picks from real types
# (spec §3.1: "the list of available widget types + their datasets +
# swapGroup"). ALLOWED_WIDGET_TYPES (services/common/layout_schema.py) is
# this backend's canonical widget-type set, kept in sync with the
# frontend's WIDGET_REGISTRY via the drift-guard test
# (backend_tests/test_allowed_widget_types.py). This backend has no
# dataset/swapGroup metadata of its own (that lives in
# src/lib/widget-registry.ts, a frontend-only module); sending just the
# type names is sufficient for the model to constrain its choices to the
# real registry, which is what the enum in the structured-outputs schema
# already enforces server-side regardless of what the model sends.
# AI remains Overview-only. Page-renderable Locations widgets deliberately do
# not enter this frozen 22-widget contract.
_AI_ALLOWED_WIDGET_TYPES = frozenset(load_overview_ai_widget_types_fixture())
_WIDGET_REGISTRY_FOR_PROMPT = sorted(_AI_ALLOWED_WIDGET_TYPES)


class AiSuggestionsNotConfiguredError(Exception):
    """Raised when ANTHROPIC_API_KEY is unset. Maps to 503 in the route.

    Deliberately distinct from a generic error: the sample-data red line
    (.claude/rules/sample-data.md §5.2) forbids silently substituting the
    deterministic DEFAULT_LAYOUT when the caller explicitly asked for an AI
    suggestion. The handler must fail explicitly, never fall back silently.
    """


class AiSuggestionFailedError(Exception):
    """Raised when the model output fails schema validation after one
    bounded retry, or the model refuses. Maps to 502 in the route."""


def _layout_json_schema() -> dict:
    """Structured-outputs JSON schema mirroring LayoutConfigModel.

    Structured-outputs schemas don't support minLength/maxLength/pattern —
    only enum/const/basic types (see the claude-api skill's Structured
    Outputs section) — so widget `type` is constrained via enum against the
    live registry (ALLOWED_WIDGET_TYPES), `size` via enum, and `version` via
    const 1, instead of the pydantic-level string length/regex checks used
    elsewhere in this repo.
    """
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "version": {"const": 1},
            "widgets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string", "enum": sorted(_AI_ALLOWED_WIDGET_TYPES)},
                        "size": {"type": "string", "enum": list(_ALLOWED_SIZES)},
                    },
                    "required": ["id", "type", "size"],
                },
            },
        },
        "required": ["version", "widgets"],
    }


def _build_aggregate_shape(summary, project_id: str) -> dict:
    """Allowlisted aggregate project shape sent to Claude (spec §5.2, widened
    from sprint 14's §3.1).

    Only: per-slot {slot_index, title, target, category_count,
    success_category_count}; total_visits; min/max date; city_count (a
    number, never city names); photo-slot usage counts; project_metrics (an
    already-tenant-scoped, already-aggregate rollup -- see
    dashboard.project_metrics in dashboard_schema.sql, which has no
    survey_id/store_id/visit-level columns); data_shape_summary (booleans/
    counts only); the widget registry (types). Never: survey rows,
    store/clerk names, addresses, individual cities, photo URLs, tenant_id,
    or any per-visit metric record (there is no such shape in this table).
    """
    install_slots = []
    for slot in summary.install_slots:
        category_count = len(slot.distribution)
        success_category_count = sum(1 for entry in slot.distribution if entry.is_success)
        install_slots.append(
            {
                "slot_index": slot.slot_index,
                "title": slot.title,
                "target": slot.target,
                "category_count": category_count,
                "success_category_count": success_category_count,
            }
        )

    # ProjectMetric field names confirmed against services/common/models.py
    # (§6.1's explicit warning): key, label, value, unit, category.
    project_metrics = [
        {
            "key": m.key,
            "label": m.label,
            "category": m.category,
            "unit": m.unit,
            "value": m.value,
        }
        for m in summary.metrics
    ]

    return {
        "project_id": project_id,
        "install_slots": install_slots,
        "total_visits": summary.total_visits,
        "date_range": {"min_date": summary.min_date, "max_date": summary.max_date},
        "city_count": summary.unique_stores,
        "photo_by_kind": dict(summary.photo_by_kind),
        "project_metrics": project_metrics,
        "data_shape_summary": {
            "has_install_slots": len(summary.install_slots) > 0,
            "install_slot_count": len(summary.install_slots),
            "has_photos": len(summary.photo_by_kind) > 0,
            "photo_kind_count": len(summary.photo_by_kind),
            "has_metrics": len(project_metrics) > 0,
            "metric_count": len(project_metrics),
            "total_visits": summary.total_visits,
        },
        "widget_registry": _WIDGET_REGISTRY_FOR_PROMPT,
    }


def _system_prompt() -> str:
    return (
        "You design full analytics overview pages for a retail-execution "
        "analytics product. Given an aggregate summary of a project's actual "
        "populated data shapes (install slots, custom metrics, photo "
        "coverage, visit volume/dates) and the available widget registry, "
        "propose a LayoutConfig that surfaces what this project actually has "
        "data for -- an ordered list of widget instances (id, type, size) "
        "drawn only from widget types present in the provided registry. "
        "Prefer primitives whose required dataset is populated according to "
        "data_shape_summary; do not select a primitive for a dataset marked "
        "empty there other than 'empty-state-note', which is reserved for "
        "genuinely sparse projects with almost nothing populated -- never "
        "pick it for a project with any populated dataset. Typically 6-12 "
        "widgets for a normally-populated project. Respond with the "
        "LayoutConfig JSON only."
    )


async def suggest_layout(
    claims: AuthClaims,
    project_id: str,
    repository: DashboardRepository,
    settings: Settings,
) -> dict:
    """Build the aggregate project shape, call Claude with the LayoutConfig
    json_schema, validate the result with layout_schema, and return it.

    Never persists. Raises AiSuggestionsNotConfiguredError if
    settings.anthropic_api_key is unset, or AiSuggestionFailedError if the
    model refuses or its output fails schema validation after one retry.
    """
    if not settings.anthropic_api_key:
        raise AiSuggestionsNotConfiguredError("AI suggestions not configured")

    # anthropic import lives ONLY in this module (service-boundary discipline).
    import anthropic

    summary = await repository.get_project_summary(claims, project_id)
    aggregate_shape = _build_aggregate_shape(summary, project_id)
    schema = _layout_json_schema()

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    user_message = (
        "Aggregate project shape (JSON):\n"
        f"{json.dumps(aggregate_shape, sort_keys=True)}\n\n"
        "Propose a LayoutConfig for this project."
    )

    validated: LayoutConfigModel | None = None
    last_error: Exception | None = None

    for attempt in range(2):  # one bounded retry, per spec §4.2
        try:
            response = await client.messages.create(
                model=_MODEL_ID,
                max_tokens=_MAX_TOKENS,
                thinking={"type": "adaptive"},
                output_config={
                    "effort": "medium",
                    "format": {"type": "json_schema", "schema": schema},
                },
                system=_system_prompt(),
                messages=[{"role": "user", "content": user_message}],
            )
        except anthropic.APIError as exc:
            last_error = exc
            continue

        if response.stop_reason == "refusal":
            last_error = AiSuggestionFailedError("Model refused the suggestion request")
            continue

        text_content = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        try:
            candidate = json.loads(text_content)
            validated = LayoutConfigModel.model_validate(candidate)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            continue

        break

    if validated is None:
        raise AiSuggestionFailedError(
            f"AI layout suggestion failed validation after retry: {last_error}"
        ) from last_error

    return validated.model_dump()
