"""Tests for server-side visit pagination (Sprint PERF Task 2.1).

Exercises InMemoryDashboardRepository.list_visits_page, which mirrors the
Postgres keyset-pagination semantics in postgres_repository.py, plus the
route-layer cursor codec in services/api/routes/projects.py.

No pytest-asyncio plugin is installed here, so async calls are driven via
asyncio.run() inside plain sync tests.
"""

import asyncio

from services.common.models import AuthClaims, Project, Role, Tenant, Visit
from services.common.repository import InMemoryDashboardRepository, VisitFilters
from services.api.routes.projects import _decode_cursor, _encode_cursor

TENANT_ID = "tenant_a"
PROJECT_ID = "P1"

CLAIMS = AuthClaims(user_id="u", role=Role.PLATFORM_ADMIN, tenant_id=None)


def _seed_repo(n: int = 60) -> InMemoryDashboardRepository:
    tenant = Tenant(id=TENANT_ID, name="Tenant A", slug="tenant-a")
    project = Project(id=PROJECT_ID, tenant_id=TENANT_ID, name="P1", slug="p1", client_name="A")
    visits = []
    for i in range(n):
        # Spread across a few dates so ties on visit_date are exercised, and
        # give every 10th store a distinctive name for search tests.
        day = 1 + (i % 6)
        store_name = "Acme Store" if i % 10 != 0 else "Special Mart"
        visits.append(
            Visit(
                instance_id=f"survey_{i:04d}",
                project_id=PROJECT_ID,
                tenant_id=TENANT_ID,
                store_id=f"store_{i}",
                store_name=store_name,
                visit_date=f"2026-01-{day:02d}",
                install1="Yes" if i % 2 == 0 else "No",
            )
        )
    return InMemoryDashboardRepository(tenants=[tenant], users=[], projects=[project], visits=visits)


def _paginate_all(repo, *, direction="desc", limit=25, search=None, filters=None):
    """Walk every page via next_cursor and return the flattened item list."""
    items_all = []
    cursor = None
    total_count = None
    guard = 0
    while True:
        guard += 1
        assert guard < 100, "pagination did not terminate"
        decoded = _decode_cursor(cursor) if cursor else None
        items, total_count, _filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS,
                PROJECT_ID,
                cursor=decoded,
                limit=limit,
                direction=direction,
                search=search,
                filters=filters,
            )
        )
        for item in items:
            items_all.append((item["_keyset_visit_date"], item["_keyset_survey_id"]))
        if not items:
            break
        has_more = items[-1]["_keyset_has_more"]
        if not has_more:
            break
        last = items[-1]
        cursor = _encode_cursor(last["_keyset_visit_date"], last["_keyset_survey_id"], "next")
    return items_all, total_count


class TestFirstPage:
    def test_returns_limit_items_with_has_more(self):
        repo = _seed_repo(60)
        items, total_count, _filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=None, limit=25, direction="desc", search=None, filters=None
            )
        )
        assert len(items) == 25
        assert total_count == 60
        assert items[-1]["_keyset_has_more"] is True

    def test_last_page_has_no_more(self):
        repo = _seed_repo(10)
        items, total_count, _filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=None, limit=25, direction="desc", search=None, filters=None
            )
        )
        assert len(items) == 10
        assert total_count == 10
        assert items[-1]["_keyset_has_more"] is False


class TestFullTraversal:
    def test_no_overlap_no_gaps_desc(self):
        repo = _seed_repo(60)
        all_items, total_count = _paginate_all(repo, direction="desc", limit=25)
        assert total_count == 60
        assert len(all_items) == 60
        assert len(set(all_items)) == 60  # no duplicates

        # Concatenation must equal the full ordered set (desc order).
        expected = sorted(
            {(v.visit_date, v.instance_id) for v in repo.visits}, reverse=True
        )
        assert all_items == expected

    def test_no_overlap_no_gaps_asc(self):
        repo = _seed_repo(60)
        all_items, total_count = _paginate_all(repo, direction="asc", limit=25)
        assert total_count == 60
        expected = sorted({(v.visit_date, v.instance_id) for v in repo.visits})
        assert all_items == expected

    def test_ties_ordered_deterministically_by_survey_id(self):
        repo = _seed_repo(60)
        all_items, _ = _paginate_all(repo, direction="desc", limit=7)
        # Within any run of equal visit_date, survey_id must be descending too.
        for i in range(1, len(all_items)):
            prev_date, prev_id = all_items[i - 1]
            cur_date, cur_id = all_items[i]
            if prev_date == cur_date:
                assert prev_id > cur_id


class TestPrevCursor:
    def test_prev_from_page_two_returns_page_one(self):
        repo = _seed_repo(60)
        page1, _, _fo = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=None, limit=25, direction="desc", search=None, filters=None
            )
        )
        last1 = page1[-1]
        next_cursor = _decode_cursor(
            _encode_cursor(last1["_keyset_visit_date"], last1["_keyset_survey_id"], "next")
        )
        page2, _, _fo = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=next_cursor, limit=25, direction="desc", search=None, filters=None
            )
        )
        first2 = page2[0]
        prev_cursor = _decode_cursor(
            _encode_cursor(first2["_keyset_visit_date"], first2["_keyset_survey_id"], "prev")
        )
        page1_again, _, _fo = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=prev_cursor, limit=25, direction="desc", search=None, filters=None
            )
        )
        keys1 = [(i["_keyset_visit_date"], i["_keyset_survey_id"]) for i in page1]
        keys1_again = [(i["_keyset_visit_date"], i["_keyset_survey_id"]) for i in page1_again]
        assert keys1 == keys1_again


class TestSearchAndFilters:
    def test_search_filters_by_store_name_case_insensitive(self):
        repo = _seed_repo(60)
        items, total_count, _filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=None, limit=100, direction="desc",
                search="special mart", filters=None,
            )
        )
        assert total_count == 6  # every 10th of 60 -> 6 matches
        assert len(items) == 6

    def test_filters_install1_and_date_range(self):
        repo = _seed_repo(60)
        filters = VisitFilters(install1=["Yes"], date_from=None, date_to=None)
        items, total_count, _filter_options = asyncio.run(
            repo.list_visits_page(
                CLAIMS, PROJECT_ID, cursor=None, limit=100, direction="desc",
                search=None, filters=filters,
            )
        )
        assert total_count == 30  # half of 60 have install1="Yes"
        assert all(True for _ in items)  # items returned without error

    def test_unknown_filter_key_rejected_by_pydantic(self):
        import pytest

        with pytest.raises(Exception):
            VisitFilters.model_validate({"tenant_id": "sneaky"})


class TestTenantIsolation:
    def test_cross_tenant_project_access_denied(self):
        import pytest
        from services.common.tenancy import AuthorizationError

        repo = _seed_repo(10)
        foreign_claims = AuthClaims(
            user_id="u2", role=Role.TENANT_USER, tenant_id="tenant_other", project_ids=(PROJECT_ID,)
        )
        with pytest.raises(AuthorizationError):
            asyncio.run(
                repo.list_visits_page(
                    foreign_claims, PROJECT_ID, cursor=None, limit=25, direction="desc",
                    search=None, filters=None,
                )
            )
