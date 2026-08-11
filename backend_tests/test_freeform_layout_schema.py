import pytest
from pydantic import ValidationError

from services.common.freeform_layout_schema import FreeformLayoutConfigModel
from services.api.services.layout_suggestion import _layout_json_schema
from services.api.routes.admin import DashboardLayoutUpdateRequest, update_dashboard_layout
from fastapi import HTTPException
from services.common.models import AuthClaims, Project, Role, Tenant
from services.common.repository import InMemoryDashboardRepository
import asyncio


def valid_layout():
    return {"version": 2, "cols": 12, "widgets": [{"id": "a", "type": "kpi-total-visits", "x": 0, "y": 0, "w": 3, "h": 1}]}


def test_accepts_valid_freeform_layout():
    assert FreeformLayoutConfigModel.model_validate(valid_layout()).version == 2


@pytest.mark.parametrize("mutate", [
    lambda body: body["widgets"][0].update(x=-1),
    lambda body: body["widgets"][0].update(w=13),
    lambda body: body["widgets"][0].update(type="unknown"),
])
def test_rejects_invalid_bounds_and_unknown_types(mutate):
    body = valid_layout(); mutate(body)
    with pytest.raises(ValidationError):
        FreeformLayoutConfigModel.model_validate(body)


def test_rejects_overlapping_rectangles():
    body = valid_layout()
    body["widgets"].append({"id": "b", "type": "top-locations", "x": 2, "y": 0, "w": 4, "h": 1})
    with pytest.raises(ValidationError):
        FreeformLayoutConfigModel.model_validate(body)


def test_put_route_dispatches_v1_and_v2_and_rejects_unknown_version():
    """Exercise the actual admin PUT seam; authorization stays in the handler."""
    repo = InMemoryDashboardRepository(
        tenants=[Tenant(id="tenant_a", name="Tenant A", slug="tenant-a")],
        users=[],
        projects=[Project(id="proj_a", tenant_id="tenant_a", name="A", slug="a", client_name="A")],
    )
    claims = AuthClaims(user_id="admin", role=Role.PLATFORM_ADMIN, tenant_id=None)
    v1 = {"version": 1, "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}]}
    v2 = valid_layout()

    first = asyncio.run(update_dashboard_layout("proj_a", DashboardLayoutUpdateRequest(layout=v1), "overview", claims, repo))
    second = asyncio.run(update_dashboard_layout("proj_a", DashboardLayoutUpdateRequest(layout=v2), "overview", claims, repo))
    assert first["layout"]["version"] == 1
    assert second["layout"]["version"] == 2
    with pytest.raises(HTTPException) as exc:
        asyncio.run(update_dashboard_layout("proj_a", DashboardLayoutUpdateRequest(layout={"version": 99, "widgets": []}), "overview", claims, repo))
    assert exc.value.status_code == 422


def test_locations_widgets_validate_but_are_not_offered_to_overview_ai():
    body = valid_layout()
    body["widgets"][0]["type"] = "geo-map"
    assert FreeformLayoutConfigModel.model_validate(body).widgets[0].type == "geo-map"
    enum = _layout_json_schema()["properties"]["widgets"]["items"]["properties"]["type"]["enum"]
    assert "geo-map" not in enum
