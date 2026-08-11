"""Sprint 13b — server-side layout validation tests (services/common/layout_schema.py).

The PUT body is untrusted input (.claude/rules/api-boundary.md): unknown
widget type / bad size / wrong version / non-primitive params must all be
rejected (422 at the route layer, ValidationError here at the schema layer).
"""

import pytest
from pydantic import ValidationError

from services.api.routes.admin import require_client_admin_or_above
from services.common.layout_schema import ALLOWED_WIDGET_TYPES, LayoutConfigModel
from services.common.models import AuthClaims, Role
from services.api.exceptions import AuthorizationError


def _claims(role: Role) -> AuthClaims:
    return AuthClaims(user_id="u1", role=role, tenant_id="tenant_a")


class TestLayoutConfigModelAccepts:
    def test_valid_minimal_layout(self):
        model = LayoutConfigModel.model_validate(
            {"version": 1, "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}]}
        )
        assert model.version == 1
        assert model.widgets[0].type == "kpi-total-visits"

    def test_valid_layout_with_primitive_params(self):
        model = LayoutConfigModel.model_validate(
            {
                "version": 1,
                "widgets": [
                    {"id": "w1", "type": "kpi-install-slot", "size": "sm", "params": {"slotIndex": 1}}
                ],
            }
        )
        assert model.widgets[0].params == {"slotIndex": 1}

    def test_every_registry_type_is_individually_accepted(self):
        for widget_type in sorted(ALLOWED_WIDGET_TYPES):
            model = LayoutConfigModel.model_validate(
                {"version": 1, "widgets": [{"id": "w1", "type": widget_type, "size": "md"}]}
            )
            assert model.widgets[0].type == widget_type


class TestLayoutConfigModelRejects:
    def test_unknown_widget_type_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate(
                {"version": 1, "widgets": [{"id": "w1", "type": "does-not-exist", "size": "sm"}]}
            )

    def test_bad_size_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate(
                {"version": 1, "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "huge"}]}
            )

    def test_wrong_version_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate(
                {"version": 2, "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}]}
            )

    def test_empty_widgets_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate({"version": 1, "widgets": []})

    def test_too_many_widgets_rejected(self):
        widgets = [
            {"id": f"w{i}", "type": "kpi-total-visits", "size": "sm"} for i in range(25)
        ]
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate({"version": 1, "widgets": widgets})

    def test_unknown_top_level_field_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate(
                {
                    "version": 1,
                    "widgets": [{"id": "w1", "type": "kpi-total-visits", "size": "sm"}],
                    "tenant_id": "smuggled",
                }
            )

    def test_non_primitive_params_rejected(self):
        with pytest.raises(ValidationError):
            LayoutConfigModel.model_validate(
                {
                    "version": 1,
                    "widgets": [
                        {
                            "id": "w1",
                            "type": "kpi-total-visits",
                            "size": "sm",
                            "params": {"nested": {"a": 1}},
                        }
                    ],
                }
            )


class TestAdminGating:
    def test_tenant_user_rejected(self):
        with pytest.raises(AuthorizationError):
            require_client_admin_or_above(_claims(Role.TENANT_USER))

    def test_client_admin_allowed(self):
        assert require_client_admin_or_above(_claims(Role.CLIENT_ADMIN)) is not None

    def test_platform_admin_allowed(self):
        assert require_client_admin_or_above(_claims(Role.PLATFORM_ADMIN)) is not None
