"""Regression test for the page-2+ visits pagination 500.

Root cause: services/api/routes/projects.py::_decode_cursor base64/JSON-decodes
the opaque cursor but leaves the "d" (visit_date) field as a plain ISO string.
PostgresDashboardRepository.list_visits_page (services/common/postgres_repository.py)
previously forwarded that raw string straight into the asyncpg query args used
for the keyset predicate `(v.visit_date, v.survey_id) {op} ($N, $N+1)`. asyncpg's
date codec requires a real `datetime.date` (it calls `.toordinal()` on the bound
value) and raises `AttributeError: 'str' object has no attribute 'toordinal'`
wrapped in `asyncpg.exceptions.DataError` when given a str -- this only
surfaces once a cursor is present, i.e. from page 2 onward, matching the
reported symptom (page 1 = 200, "next page" click = 500).

This test exercises the real PostgresDashboardRepository.list_visits_page
method (the exact method in the traceback) with a stubbed DB I/O boundary
(_fetch_all_replica / _fetch_one_replica / get_project), so no live Postgres
connection is required, while still asserting on the exact bound query
parameters asyncpg would receive.
"""

import asyncio
from datetime import date

import pytest

from services.common.models import AuthClaims, Project, Role
from services.common.postgres_repository import PostgresDashboardRepository
from services.api.routes.projects import _decode_cursor, _encode_cursor

TENANT_ID = "tenant_brasserie_labatt"
PROJECT_ID = "project_brasserie_labatt"

CLAIMS = AuthClaims(user_id="u", role=Role.PLATFORM_ADMIN, tenant_id=None)

_PROJECT = Project(
    id=PROJECT_ID,
    tenant_id=TENANT_ID,
    name="Brasserie Labatt",
    slug="brasserie-labatt",
    client_name="Labatt",
)


def _make_repo(monkeypatch) -> PostgresDashboardRepository:
    repo = PostgresDashboardRepository(database_url="postgresql://unused/unused")

    async def _fake_get_project(project_id, tenant_ids):
        return _PROJECT

    captured_calls: list[tuple[str, tuple]] = []

    async def _fake_fetch_all_replica(query, *args):
        captured_calls.append((query, args))
        return []

    async def _fake_fetch_one_replica(query, *args):
        captured_calls.append((query, args))
        return {"cnt": 0, "cities": [], "install1_values": [], "install2_values": [], "install3_values": []}

    monkeypatch.setattr(repo, "get_project", _fake_get_project)
    monkeypatch.setattr(repo, "_fetch_all_replica", _fake_fetch_all_replica)
    monkeypatch.setattr(repo, "_fetch_one_replica", _fake_fetch_one_replica)
    repo._captured_calls = captured_calls  # type: ignore[attr-defined]
    return repo


class TestCursorDateTypeCoercion:
    def test_decoded_cursor_date_is_str_before_repository_call(self):
        """Sanity check on the reported traceback: the route-layer cursor
        codec hands back the date field as a plain string, not a date."""
        raw_cursor = _encode_cursor("2026-04-07", "1707769", "next")
        decoded = _decode_cursor(raw_cursor)
        assert decoded["d"] == "2026-04-07"
        assert isinstance(decoded["d"], str)

    def test_list_visits_page_binds_a_real_date_object_for_cursor(self, monkeypatch):
        """This is the exact failure from the bug report: a page-2 request
        (cursor present) must bind a datetime.date -- not a str -- as the
        keyset predicate's date argument, or asyncpg raises DataError at the
        asyncpg.pgproto.pgproto.date_encode boundary."""
        repo = _make_repo(monkeypatch)
        raw_cursor = _encode_cursor("2026-04-07", "1707769", "next")
        decoded_cursor = _decode_cursor(raw_cursor)

        items, total_count, filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS,
                PROJECT_ID,
                cursor=decoded_cursor,
                limit=25,
                direction="desc",
                search=None,
                filters=None,
            )
        )

        # Find the page-query call: it's the one whose args include the
        # keyset predicate values appended after tenant_id/project_id.
        page_call = next(
            (call for call in repo._captured_calls if "LEFT JOIN LATERAL" in call[0]),
            None,
        )
        assert page_call is not None, "expected the page-fetch query to have been issued"
        _, args = page_call

        # args = [tenant_id, project_id, cursor_date, cursor_survey_id, limit+1]
        assert args[0] == TENANT_ID
        assert args[1] == PROJECT_ID
        cursor_date_arg = args[2]
        cursor_survey_id_arg = args[3]

        assert isinstance(cursor_date_arg, date), (
            f"cursor date arg must be a datetime.date for asyncpg, got "
            f"{type(cursor_date_arg).__name__}: {cursor_date_arg!r}"
        )
        assert cursor_date_arg == date(2026, 4, 7)
        assert cursor_survey_id_arg == "1707769"

    def test_first_page_still_has_no_cursor_predicate(self, monkeypatch):
        """Page 1 (no cursor) must remain unaffected -- confirms the fix is
        scoped to the cursor branch only."""
        repo = _make_repo(monkeypatch)

        asyncio.run(
            repo.list_visits_page(
                CLAIMS,
                PROJECT_ID,
                cursor=None,
                limit=25,
                direction="desc",
                search=None,
                filters=None,
            )
        )

        page_call = next(
            (call for call in repo._captured_calls if "LEFT JOIN LATERAL" in call[0]),
            None,
        )
        assert page_call is not None
        _, args = page_call
        # No cursor -> only tenant_id, project_id, limit+1.
        assert len(args) == 3
        assert args[0] == TENANT_ID
        assert args[1] == PROJECT_ID
        assert args[2] == 26
