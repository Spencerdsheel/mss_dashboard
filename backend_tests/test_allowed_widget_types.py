"""Sprint 13b — drift guard (required by spec §4.2).

Asserts the backend's canonical `ALLOWED_WIDGET_TYPES` frozenset matches the
committed fixture `services/common/allowed_widget_types.json` exactly. A
Vitest counterpart (tests/allowed-widget-types.test.ts) asserts the same
fixture equals `Object.keys(WIDGET_REGISTRY)` (sorted). Either side drifting
from the fixture is a red test — this is the single source of truth for
"what widget types exist" (also protects sprint 14's AI-suggestion validation
path, which reuses this same schema).
"""

from services.common.layout_schema import ALLOWED_WIDGET_TYPES, load_allowed_widget_types_fixture


class TestAllowedWidgetTypesFixtureSync:
    def test_fixture_matches_backend_frozenset(self):
        fixture = load_allowed_widget_types_fixture()
        assert fixture == sorted(fixture), "fixture must be committed pre-sorted"
        assert set(fixture) == ALLOWED_WIDGET_TYPES
        assert len(fixture) == len(ALLOWED_WIDGET_TYPES), "fixture must not contain duplicates"
        assert len(fixture) == 27
