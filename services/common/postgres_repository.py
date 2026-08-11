from __future__ import annotations

import json
from typing import Any

from datetime import date, datetime
from uuid import uuid4

import asyncpg

from .logging_config import get_logger
from .models import AuthClaims, Company, DashboardLayout, DistributionEntry, InstallCategory, InstallSlot, Project, ProjectMetric, ProjectSummary, Role, RunLog, Tenant, User, Visit, VisitPhoto, resolve_role
from .repository import DashboardRepository, VisitFilters, seed_phase01_repository, to_client_visit_dict, to_public_dict
from .secrets import encrypt_secret
from .security import hash_password, hash_reset_token, verify_password, verify_reset_token, generate_reset_token
from .tenancy import assert_project_access, tenant_scope

logger = get_logger(__name__)


class PostgresDashboardRepository:
    """Tenant-scoped repository backed by the Phase 03 dashboard schema.

    Uses asyncpg with connection pooling for async-first database access.
    Supports optional read replica for read-heavy queries.
    """

    def __init__(
        self,
        database_url: str,
        auth_repository: DashboardRepository | None = None,
        min_size: int = 5,
        max_size: int = 20,
        timeout: float = 30.0,
        read_replica_url: str | None = None,
        via_pgbouncer: bool = False,
    ) -> None:
        self.database_url = database_url
        self.read_replica_url = read_replica_url
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout
        self.via_pgbouncer = via_pgbouncer
        self.pool: asyncpg.Pool | None = None
        self.replica_pool: asyncpg.Pool | None = None
        self.auth_repository = auth_repository or seed_phase01_repository()

    async def initialize_pool(self) -> None:
        """Create the connection pool. Call on application startup.

        When `via_pgbouncer` is set, `statement_cache_size=0` disables asyncpg's
        automatic prepared-statement cache — required for correctness under
        PgBouncer transaction pooling, where a prepared statement created on
        one physical connection may be reused on a different one across
        transactions.
        """
        pool_kwargs: dict[str, Any] = {}
        if self.via_pgbouncer:
            pool_kwargs["statement_cache_size"] = 0

        self.pool = await asyncpg.create_pool(
            dsn=self.database_url,
            min_size=self.min_size,
            max_size=self.max_size,
            timeout=self.timeout,
            **pool_kwargs,
        )
        if self.read_replica_url:
            try:
                self.replica_pool = await asyncpg.create_pool(
                    dsn=self.read_replica_url,
                    min_size=self.min_size,
                    max_size=self.max_size,
                    timeout=self.timeout,
                    **pool_kwargs,
                )
            except Exception:
                self.replica_pool = None

    async def close_pool(self) -> None:
        """Close the connection pool. Call on application shutdown."""
        if self.pool:
            await self.pool.close()
            self.pool = None
        if self.replica_pool:
            await self.replica_pool.close()
            self.replica_pool = None

    async def _fetch_one(self, query: str, *args: Any) -> asyncpg.Record | None:
        rows = await self._fetch_all(query, *args)
        return rows[0] if rows else None

    async def _fetch_all(self, query: str, *args: Any) -> list[asyncpg.Record]:
        if self.pool is None:
            raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def _fetch_one_replica(self, query: str, *args: Any) -> asyncpg.Record | None:
        rows = await self._fetch_all_replica(query, *args)
        return rows[0] if rows else None

    async def _fetch_all_replica(self, query: str, *args: Any) -> list[asyncpg.Record]:
        if self.replica_pool is not None:
            try:
                async with self.replica_pool.acquire() as conn:
                    return await conn.fetch(query, *args)
            except Exception:
                pass
        if self.pool is None:
            raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def _execute(self, query: str, *args: Any) -> str:
        if self.pool is None:
            raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    # S6: Pre-computed dummy hash used when the requested user does not exist.
    # Running verify_password against it ensures the response time is
    # indistinguishable from a valid-user-wrong-password attempt, preventing
    # user-enumeration via timing side-channels.
    _DUMMY_HASH = (
        "pbkdf2_sha256$120000$"
        "AAAAAAAAAAAAAAAAAAAAAA"
        "$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    )

    async def authenticate_user(self, email: str, password: str) -> User | None:
        """Authenticate user against database credentials.

        S6: Always runs a full PBKDF2 verify (120 000 iterations) regardless of
        whether the user row exists, so timing is constant and cannot be used to
        enumerate valid email addresses.
        """
        row = await self._fetch_one(
            """
            SELECT user_id, tenant_id, email, name, role, project_ids,
                   hashed_password, status, company_id, tenant_ids
            FROM dashboard.users
            WHERE email = $1 AND status = 'active'
            """,
            email,
        )

        stored_hash = (row or {}).get("hashed_password") or self._DUMMY_HASH
        valid = verify_password(password, stored_hash)

        if not row or not row.get("hashed_password") or not valid:
            return None

        return User(
            id=str(row["user_id"]),
            email=str(row["email"]),
            name=row.get("name"),
            role=Role(str(row["role"])),
            tenant_id=row.get("tenant_id"),
            hashed_password=row["hashed_password"],
            project_ids=tuple(row.get("project_ids") or []),
            company_id=row.get("company_id"),
            tenant_ids=tuple(row.get("tenant_ids") or []),
        )

    async def list_projects(self, claims: AuthClaims) -> list[Project]:
        if claims.role == Role.PLATFORM_ADMIN:
            rows = await self._fetch_all(
                """
                SELECT p.tenant_id, p.project_id, p.name, p.slug, p.client_name,
                       p.provider_kind, p.start_date, p.end_date,
                       COALESCE(vc.visit_count, 0) AS visit_count
                FROM dashboard.projects p
                LEFT JOIN (
                    SELECT tenant_id, project_id, COUNT(*) AS visit_count
                    FROM dashboard.visits
                    GROUP BY tenant_id, project_id
                ) vc ON vc.tenant_id = p.tenant_id AND vc.project_id = p.project_id
                ORDER BY p.name ASC
                """
            )
        elif claims.role == Role.CLIENT_ADMIN:
            if not claims.tenant_ids:
                return []
            rows = await self._fetch_all(
                """
                SELECT p.tenant_id, p.project_id, p.name, p.slug, p.client_name,
                       p.provider_kind, p.start_date, p.end_date,
                       COALESCE(vc.visit_count, 0) AS visit_count
                FROM dashboard.projects p
                LEFT JOIN (
                    SELECT tenant_id, project_id, COUNT(*) AS visit_count
                    FROM dashboard.visits
                    WHERE tenant_id = ANY($1)
                    GROUP BY tenant_id, project_id
                ) vc ON vc.tenant_id = p.tenant_id AND vc.project_id = p.project_id
                WHERE p.tenant_id = ANY($1)
                ORDER BY p.name ASC
                """,
                list(claims.tenant_ids),
            )
        else:
            if claims.tenant_id is None or not claims.project_ids:
                return []
            rows = await self._fetch_all(
                """
                SELECT p.tenant_id, p.project_id, p.name, p.slug, p.client_name,
                       p.provider_kind, p.start_date, p.end_date,
                       COALESCE(vc.visit_count, 0) AS visit_count
                FROM dashboard.projects p
                LEFT JOIN (
                    SELECT tenant_id, project_id, COUNT(*) AS visit_count
                    FROM dashboard.visits
                    WHERE tenant_id = $1
                    GROUP BY tenant_id, project_id
                ) vc ON vc.tenant_id = p.tenant_id AND vc.project_id = p.project_id
                WHERE p.tenant_id = $1 AND p.project_id = ANY($2)
                ORDER BY p.name ASC
                """,
                claims.tenant_id,
                list(claims.project_ids),
            )
        return [project_from_row(row) for row in rows]

    async def get_project(self, project_id: str, tenant_ids: list[str] | None) -> Project | None:
        """Resolve a project scoped to the caller's tenants.

        tenant_ids semantics:
          - None  -> PLATFORM_ADMIN: no tenant filter (cross-tenant lookup allowed).
          - list  -> filter WHERE tenant_id = ANY($1). Empty list => always None.

        This fixes the composite-key bug where a bare `project_id` lookup would
        resolve to whichever tenant's row happened to sort first, silently
        leaking one tenant's project into another tenant's request when two
        tenants share a project_id.
        """
        if tenant_ids is not None and not tenant_ids:
            return None
        if tenant_ids is None:
            row = await self._fetch_one(
                """
                SELECT tenant_id, project_id, name, slug, client_name,
                       provider_kind, start_date, end_date
                FROM dashboard.projects
                WHERE project_id = $1
                ORDER BY tenant_id ASC
                LIMIT 1
                """,
                project_id,
            )
        else:
            row = await self._fetch_one(
                """
                SELECT tenant_id, project_id, name, slug, client_name,
                       provider_kind, start_date, end_date
                FROM dashboard.projects
                WHERE tenant_id = ANY($1) AND project_id = $2
                LIMIT 1
                """,
                list(tenant_ids),
                project_id,
            )
        return project_from_row(row) if row else None

    async def get_project_summary(self, claims: AuthClaims, project_id: str) -> ProjectSummary:
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )

        summary_row = await self._fetch_one_replica(
            """
            WITH visit_stats AS (
                SELECT
                    COUNT(*) as total_visits,
                    COUNT(DISTINCT store_id) as unique_stores,
                    MIN(visit_date) as min_date,
                    MAX(visit_date) as max_date
                FROM dashboard.visits
                WHERE tenant_id = $1 AND project_id = $2
            ),
            photo_stats AS (
                SELECT
                    kind,
                    COUNT(*) as photo_count,
                    COUNT(DISTINCT survey_id) as visits_with_photos
                FROM dashboard.visit_photos
                WHERE tenant_id = $1 AND project_id = $2
                GROUP BY kind
            ),
            distinct_photo_surveys AS (
                SELECT DISTINCT survey_id
                FROM dashboard.visit_photos
                WHERE tenant_id = $1 AND project_id = $2
            ),
            rows_without_photos AS (
                SELECT COUNT(*) as cnt
                FROM dashboard.visits v
                LEFT JOIN distinct_photo_surveys dps ON dps.survey_id = v.survey_id
                WHERE v.tenant_id = $1 AND v.project_id = $2
                  AND dps.survey_id IS NULL
            )
            SELECT
                vs.total_visits, vs.unique_stores, vs.min_date, vs.max_date,
                COALESCE(rwp.cnt, 0) as rows_with_no_photos,
                (SELECT json_agg(json_build_object('kind', kind, 'count', photo_count))
                 FROM photo_stats) as photo_by_kind
            FROM visit_stats vs, rows_without_photos rwp
            """,
            project.tenant_id,
            project.id,
        )

        metrics_rows = await self._fetch_all_replica(
            """
            SELECT key, label, value, unit, category
            FROM dashboard.project_metrics
            WHERE tenant_id = $1 AND project_id = $2
            ORDER BY key ASC
            """,
            project.tenant_id,
            project.id,
        )

        # P1.4: Fetch campaign config (slots + categories)
        slot_rows = await self._fetch_all_replica(
            """
            SELECT slot_index, title, question, target
            FROM dashboard.project_install_slots
            WHERE tenant_id = $1 AND project_id = $2
            ORDER BY slot_index ASC
            """,
            project.tenant_id,
            project.id,
        )

        category_rows = await self._fetch_all_replica(
            """
            SELECT slot_index, position, label, is_success
            FROM dashboard.project_install_categories
            WHERE tenant_id = $1 AND project_id = $2
            ORDER BY slot_index ASC, position ASC
            """,
            project.tenant_id,
            project.id,
        )

        # Build category lookup: slot_index → {label → is_success}
        success_map: dict[int, dict[str, bool]] = {}
        for cat_row in category_rows:
            si = int(cat_row["slot_index"])
            success_map.setdefault(si, {})[str(cat_row["label"])] = bool(cat_row["is_success"])

        # P1.4: Compute per-slot distributions and success counts.
        # Task 2.3: one UNION ALL query instead of one query per install slot
        # (previously up to 4 round-trips with dynamic f-string column names).
        # The column list is a fixed literal whitelist — never derived from
        # user input — so this stays a static, parameterized query.
        install_slots: list[InstallSlot] = []

        dist_rows_all = await self._fetch_all_replica(
            """
            SELECT 1 AS slot_index, install1 AS answer, COUNT(*) AS cnt
            FROM dashboard.visits
            WHERE tenant_id = $1 AND project_id = $2 AND install1 IS NOT NULL
            GROUP BY install1
            UNION ALL
            SELECT 2, install2, COUNT(*) FROM dashboard.visits
            WHERE tenant_id = $1 AND project_id = $2 AND install2 IS NOT NULL GROUP BY install2
            UNION ALL
            SELECT 3, install3, COUNT(*) FROM dashboard.visits
            WHERE tenant_id = $1 AND project_id = $2 AND install3 IS NOT NULL GROUP BY install3
            UNION ALL
            SELECT 4, install4, COUNT(*) FROM dashboard.visits
            WHERE tenant_id = $1 AND project_id = $2 AND install4 IS NOT NULL GROUP BY install4
            ORDER BY slot_index ASC, cnt DESC
            """,
            project.tenant_id,
            project.id,
        )

        dist_map: dict[int, list[asyncpg.Record]] = {}
        for drow in dist_rows_all:
            dist_map.setdefault(int(drow["slot_index"]), []).append(drow)

        for slot_row in slot_rows:
            si = int(slot_row["slot_index"])
            if si > 4:
                continue

            distribution: list[DistributionEntry] = []
            success_count = 0
            slot_success = success_map.get(si, {})

            for drow in dist_map.get(si, []):
                label = str(drow["answer"]) if drow["answer"] else "Unknown"
                count = int(drow["cnt"])
                is_success = slot_success.get(label, False)
                distribution.append(DistributionEntry(label=label, value=count, is_success=is_success))
                if is_success:
                    success_count += count

            install_slots.append(InstallSlot(
                slot_index=si,
                title=str(slot_row["title"]),
                question=str(slot_row["question"]),
                target=int(slot_row["target"]) if slot_row["target"] else None,
                success_count=success_count,
                distribution=tuple(distribution),
            ))

        photo_by_kind: dict[str, int] = {}
        if summary_row and summary_row.get("photo_by_kind"):
            photo_data = json.loads(summary_row["photo_by_kind"])
            if photo_data:
                for item in photo_data:
                    photo_by_kind[str(item["kind"])] = int(item["count"])

        rows_with_no_photos = int(summary_row["rows_with_no_photos"]) if summary_row else 0

        return ProjectSummary(
            project_id=project.id,
            total_visits=int(summary_row["total_visits"]) if summary_row else 0,
            unique_stores=int(summary_row["unique_stores"]) if summary_row else 0,
            min_date=iso_date(summary_row["min_date"]) if summary_row else None,
            max_date=iso_date(summary_row["max_date"]) if summary_row else None,
            metrics=tuple(metric_from_row(row) for row in metrics_rows),
            install_slots=tuple(install_slots),
            photo_by_kind=photo_by_kind,
            rows_with_no_photos=rows_with_no_photos,
        )

    async def get_dashboard_layout(self, claims: AuthClaims, project_id: str, page_key: str = "overview") -> DashboardLayout | None:
        """Sprint 13a — read the stored project-level dashboard layout, if any.

        Mirrors get_project_summary's scoping exactly: tenant is resolved via
        tenant_scope(claims) + the scoped project lookup, never trusted from
        the request. Returns None when no row exists (frontend renders
        DEFAULT_LAYOUT — an explicit default, not a sample-data fallback).
        """
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )
        row = await self._fetch_one_replica(
            """
            SELECT tenant_id, project_id, page_key, layout_json, source, updated_by, updated_at
            FROM dashboard.dashboard_layouts
            WHERE tenant_id = $1 AND project_id = $2 AND page_key = $3
            """,
            project.tenant_id,
            project.id,
            page_key,
        )
        if row is None:
            return None
        return dashboard_layout_from_row(row)

    async def upsert_dashboard_layout(
        self, claims: AuthClaims, project_id: str, layout_json: dict, source: str, updated_by: str, page_key: str = "overview"
    ) -> DashboardLayout:
        """Sprint 13b — persist (insert or replace) the project-level layout.

        tenant_id resolved the same way as get_dashboard_layout — never from
        the request. Callers (routes/admin.py) authorize CLIENT_ADMIN/PLATFORM_ADMIN
        + company access before calling this.
        """
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )
        row = await self._fetch_one(
            """
            INSERT INTO dashboard.dashboard_layouts
                (tenant_id, project_id, page_key, layout_json, source, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (tenant_id, project_id, page_key) DO UPDATE SET
                layout_json = EXCLUDED.layout_json,
                source = EXCLUDED.source,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            RETURNING tenant_id, project_id, page_key, layout_json, source, updated_by, updated_at
            """,
            project.tenant_id,
            project.id,
            page_key,
            json.dumps(layout_json),
            source,
            updated_by,
        )
        return dashboard_layout_from_row(row)

    async def delete_dashboard_layout(self, claims: AuthClaims, project_id: str, page_key: str = "overview") -> None:
        """Sprint 13b — "Reset to default": delete the stored row.

        A subsequent get_dashboard_layout then returns None -> the frontend
        falls back to DEFAULT_LAYOUT (explicit default, not sample data).
        """
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )
        await self._execute(
            """
            DELETE FROM dashboard.dashboard_layouts
            WHERE tenant_id = $1 AND project_id = $2 AND page_key = $3
            """,
            project.tenant_id,
            project.id,
            page_key,
        )

    async def list_visits(self, claims: AuthClaims, project_id: str) -> list[dict]:
        """List visits with photo_count computed.

        Legacy un-paginated path — kept for one sprint while the frontend
        still does client-side paging. Hard-capped at 5000 rows so a large
        project can never return an unbounded response.
        """
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )

        # Single query with photo count via LEFT JOIN
        rows = await self._fetch_all_replica(
            """
            SELECT v.*, COALESCE(pc.photo_count, 0) as photo_count
            FROM dashboard.visits v
            LEFT JOIN (
                SELECT survey_id, COUNT(*) as photo_count
                FROM dashboard.visit_photos
                WHERE tenant_id = $1 AND project_id = $2
                GROUP BY survey_id
            ) pc ON v.survey_id = pc.survey_id
            WHERE v.tenant_id = $1 AND v.project_id = $2
            ORDER BY v.visit_date ASC, v.survey_id ASC
            LIMIT 5000
            """,
            project.tenant_id,
            project.id,
        )

        if len(rows) >= 5000:
            logger.warning(
                "list_visits hit the 5000-row legacy cap for project %s (tenant %s)",
                project.id,
                project.tenant_id,
            )

        result = []
        for row in rows:
            visit = visit_from_row(row)
            # S4: use to_client_visit_dict to strip tenant_id / project_id from
            # client-facing visit responses. Admin routes use to_public_dict directly.
            visit_dict = to_client_visit_dict(visit)
            visit_dict["photo_count"] = int(row["photo_count"])
            result.append(visit_dict)
        return result

    async def list_visits_page(
        self,
        claims: AuthClaims,
        project_id: str,
        *,
        cursor: dict | None,
        limit: int,
        direction: str,
        search: str | None,
        filters: VisitFilters | None,
    ) -> tuple[list[dict], int, dict]:
        """Keyset-paginated visit listing (Task 2.1).

        Ordering is always the composite key (visit_date, survey_id); `direction`
        controls asc/desc. `cursor` (already decoded by the route layer) may carry
        o="next" or o="prev" to walk forward/backward from a known row. All
        predicates are parameterized — no user value is ever interpolated into SQL.
        """
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )

        where_parts: list[str] = ["v.tenant_id = $1", "v.project_id = $2"]
        args: list[Any] = [project.tenant_id, project.id]

        if search:
            args.append(f"%{search}%")
            where_parts.append(f"v.store_name ILIKE ${len(args)}")

        if filters is not None:
            for col in ("install1", "install2", "install3", "install4", "city"):
                values = getattr(filters, col)
                if values:
                    args.append(list(values))
                    where_parts.append(f"v.{col} = ANY(${len(args)})")
            if filters.date_from is not None:
                args.append(filters.date_from)
                where_parts.append(f"v.visit_date >= ${len(args)}")
            if filters.date_to is not None:
                args.append(filters.date_to)
                where_parts.append(f"v.visit_date <= ${len(args)}")

        base_where = " AND ".join(where_parts)

        # Determine effective scan order + comparison operator for the keyset
        # predicate. dir=desc + o=next -> strictly earlier rows (< cursor) in
        # descending scan order; dir=desc + o=prev -> flip to ascending scan
        # (rows after the cursor), then reverse in Python so results are
        # always returned in the user-facing order.
        user_desc = direction == "desc"
        page_args = list(args)
        page_where_parts = list(where_parts)
        scan_desc = user_desc

        if cursor is not None:
            op = None
            if cursor["o"] == "next":
                scan_desc = user_desc
                op = "<" if user_desc else ">"
            else:  # prev
                scan_desc = not user_desc
                op = ">" if user_desc else "<"
            # cursor["d"] arrives as a plain ISO date string (the cursor is
            # opaque JSON decoded at the route layer) — asyncpg's date codec
            # requires a real date object (it calls .toordinal() on the
            # bound param), so parse it here, matching the date.fromisoformat
            # convention used for VisitFilters.date_from/date_to.
            cursor_date = cursor["d"] if isinstance(cursor["d"], date) else date.fromisoformat(cursor["d"])
            page_args.append(cursor_date)
            page_args.append(cursor["s"])
            d_idx = len(page_args) - 1
            s_idx = len(page_args)
            page_where_parts.append(f"(v.visit_date, v.survey_id) {op} (${d_idx}, ${s_idx})")

        page_where = " AND ".join(page_where_parts)
        order_dir = "DESC" if scan_desc else "ASC"
        page_args.append(limit + 1)
        limit_idx = len(page_args)

        page_rows = await self._fetch_all_replica(
            f"""
            WITH page AS (
                SELECT v.* FROM dashboard.visits v
                WHERE {page_where}
                ORDER BY v.visit_date {order_dir}, v.survey_id {order_dir}
                LIMIT ${limit_idx}
            )
            SELECT page.*, COALESCE(pc.photo_count, 0) AS photo_count
            FROM page
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS photo_count
                FROM dashboard.visit_photos vp
                WHERE vp.tenant_id = page.tenant_id
                  AND vp.project_id = page.project_id
                  AND vp.survey_id = page.survey_id
            ) pc ON true
            ORDER BY page.visit_date {order_dir}, page.survey_id {order_dir}
            """,
            *page_args,
        )

        has_more = len(page_rows) > limit
        rows = list(page_rows[:limit])

        # If this was a "prev" fetch, the scan ran in the opposite order —
        # flip back to the user-facing order before returning.
        if cursor is not None and cursor["o"] == "prev":
            rows.reverse()

        count_row = await self._fetch_one_replica(
            f"SELECT COUNT(*) AS cnt FROM dashboard.visits v WHERE {base_where}",
            *args,
        )
        total_count = int(count_row["cnt"]) if count_row else 0

        filter_sql = f"""
            SELECT
                COALESCE(array_agg(DISTINCT v.city) FILTER (WHERE v.city IS NOT NULL), ARRAY[]::text[]) AS cities,
                COALESCE(array_agg(DISTINCT v.install1) FILTER (WHERE v.install1 IS NOT NULL), ARRAY[]::text[]) AS install1_values,
                COALESCE(array_agg(DISTINCT v.install2) FILTER (WHERE v.install2 IS NOT NULL), ARRAY[]::text[]) AS install2_values,
                COALESCE(array_agg(DISTINCT v.install3) FILTER (WHERE v.install3 IS NOT NULL), ARRAY[]::text[]) AS install3_values
            FROM dashboard.visits v
            WHERE {base_where}
        """
        filter_row = await self._fetch_one_replica(filter_sql, *args)
        filter_options = {
            "cities": sorted(filter_row["cities"]) if filter_row else [],
            "install1_values": sorted(filter_row["install1_values"]) if filter_row else [],
            "install2_values": sorted(filter_row["install2_values"]) if filter_row else [],
            "install3_values": sorted(filter_row["install3_values"]) if filter_row else [],
        }

        result: list[dict] = []
        for row in rows:
            visit = visit_from_row(row)
            visit_dict = to_client_visit_dict(visit)
            visit_dict["photo_count"] = int(row["photo_count"])
            result.append(visit_dict)

        # Stash raw keyset values (pre-strip) so the route layer can build
        # next/prev cursors without re-deriving them from the stripped dicts.
        # `_keyset_has_more` tells the route whether the peeked (limit+1)-th
        # row existed, i.e. whether a next page is available — the returned
        # `result` list itself is always trimmed to `limit` items.
        for visit_dict, row in zip(result, rows):
            visit_dict["_keyset_visit_date"] = iso_date(row["visit_date"]) or str(row["visit_date"])
            visit_dict["_keyset_survey_id"] = str(row["survey_id"])
            visit_dict["_keyset_has_more"] = has_more

        return result, total_count, filter_options

    async def get_visit(self, claims: AuthClaims, project_id: str, instance_id: str) -> Visit | None:
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )
        row = await self._fetch_one_replica(
            """
            SELECT *
            FROM dashboard.visits
            WHERE tenant_id = $1 AND project_id = $2 AND survey_id = $3
            """,
            project.tenant_id,
            project.id,
            instance_id,
        )
        return visit_from_row(row) if row else None

    async def list_photos(self, claims: AuthClaims, project_id: str, instance_id: str) -> list[VisitPhoto]:
        project = assert_project_access(
            claims, await self.get_project(project_id, tenant_scope(claims))
        )
        rows = await self._fetch_all_replica(
            """
            SELECT tenant_id, project_id, survey_id, kind, url, caption
            FROM dashboard.visit_photos
            WHERE tenant_id = $1 AND project_id = $2 AND survey_id = $3
            ORDER BY kind ASC
            """,
            project.tenant_id,
            project.id,
            instance_id,
        )
        return [photo_from_row(row) for row in rows]

    async def list_tenants(self) -> list[Tenant]:
        rows = await self._fetch_all_replica(
            "SELECT tenant_id, name, slug, locale, company_id FROM dashboard.tenants ORDER BY name ASC"
        )
        return [
            Tenant(
                id=str(row["tenant_id"]),
                name=str(row["name"]),
                slug=str(row["slug"]),
                country=None,
                company_id=row.get("company_id"),
            )
            for row in rows
        ]

    async def list_companies(self) -> list[Company]:
        rows = await self._fetch_all(
            "SELECT * FROM dashboard.companies ORDER BY name ASC"
        )
        return [company_from_row(r) for r in rows]

    async def create_company(self, company_id: str, name: str, slug: str) -> Company:
        row = await self._fetch_one(
            """INSERT INTO dashboard.companies (company_id, name, slug)
               VALUES ($1, $2, $3)
               RETURNING *""",
            company_id, name, slug,
        )
        return company_from_row(row)

    async def get_company(self, company_id: str) -> Company | None:
        row = await self._fetch_one(
            "SELECT * FROM dashboard.companies WHERE company_id = $1",
            company_id,
        )
        return company_from_row(row) if row else None

    async def update_company(self, company_id: str, name: str | None = None, slug: str | None = None) -> Company:
        row = await self._fetch_one(
            """UPDATE dashboard.companies
               SET name = COALESCE($2, name),
                   slug = COALESCE($3, slug),
                   updated_at = now()
               WHERE company_id = $1
               RETURNING *""",
            company_id, name, slug,
        )
        return company_from_row(row)

    async def list_tenants_for_company(self, company_id: str) -> list[Tenant]:
        rows = await self._fetch_all(
            """SELECT * FROM dashboard.tenants
               WHERE company_id = $1
               ORDER BY name ASC""",
            company_id,
        )
        return [tenant_from_row(r) for r in rows]

    async def assign_tenant_to_company(self, tenant_id: str, company_id: str) -> Tenant:
        row = await self._fetch_one(
            """UPDATE dashboard.tenants
               SET company_id = $2, updated_at = now()
               WHERE tenant_id = $1
               RETURNING *""",
            tenant_id, company_id,
        )
        if not row:
            raise ValueError(f"Tenant '{tenant_id}' not found")
        return tenant_from_row(row)

    async def list_users(self) -> list[User]:
        rows = await self._fetch_all_replica(
            """
            SELECT user_id, tenant_id, email, name, role, project_ids, company_id, tenant_ids
            FROM dashboard.users
            ORDER BY email ASC
            """
        )
        if not rows:
            return self.auth_repository.list_users()
        return [user_from_row(row) for row in rows]

    async def list_users_for_company(self, company_id: str) -> list[User]:
        rows = await self._fetch_all(
            """SELECT user_id, tenant_id, email, name, role, project_ids, company_id, tenant_ids
               FROM dashboard.users
               WHERE company_id = $1 AND status = 'active'
               ORDER BY email ASC""",
            company_id,
        )
        return [user_from_row(r) for r in rows]

    async def list_tenants_for_admin(self, tenant_ids: tuple[str, ...]) -> list[Tenant]:
        if not tenant_ids:
            return []
        rows = await self._fetch_all(
            """SELECT tenant_id, name, slug, locale, company_id
               FROM dashboard.tenants
               WHERE tenant_id = ANY($1)
               ORDER BY name ASC""",
            list(tenant_ids),
        )
        return [tenant_from_row(r) for r in rows]

    async def list_users_for_tenants(self, tenant_ids: tuple[str, ...]) -> list[User]:
        if not tenant_ids:
            return []
        rows = await self._fetch_all(
            """SELECT user_id, tenant_id, email, name, role, project_ids,
                      company_id, tenant_ids
               FROM dashboard.users
               WHERE status = 'active'
                 AND (tenant_id = ANY($1) OR tenant_ids && $1::TEXT[])
               ORDER BY email ASC""",
            list(tenant_ids),
        )
        return [user_from_row(r) for r in rows]

    async def list_run_logs(self) -> list[RunLog]:
        rows = await self._fetch_all_replica(
            """
            SELECT run_id, tenant_id, status, started_at, finished_at,
                   rows_pulled, error_message
            FROM dashboard.run_logs
            ORDER BY started_at DESC
            LIMIT 100
            """
        )
        return [run_log_from_row(row) for row in rows]

    async def list_run_logs_for_tenants(self, tenant_ids: tuple[str, ...]) -> list[RunLog]:
        if not tenant_ids:
            return []
        rows = await self._fetch_all_replica(
            """
            SELECT run_id, tenant_id, status, started_at, finished_at,
                   rows_pulled, error_message
            FROM dashboard.run_logs
            WHERE tenant_id = ANY($1)
            ORDER BY started_at DESC
            LIMIT 100
            """,
            list(tenant_ids),
        )
        return [run_log_from_row(row) for row in rows]

    async def create_tenant(self, name: str, slug: str, locale: str = "fr-CA") -> Tenant:
        tenant_id = f"tenant_{slug.replace('-', '_')}"
        await self._execute(
            """
            INSERT INTO dashboard.tenants (tenant_id, name, slug, locale)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tenant_id) DO UPDATE SET
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                locale = EXCLUDED.locale
            """,
            tenant_id,
            name,
            slug,
            locale,
        )
        return Tenant(id=tenant_id, name=name, slug=slug)

    async def update_tenant(self, tenant_id: str, name: str | None, slug: str | None, locale: str | None) -> Tenant:
        existing = await self._fetch_one(
            "SELECT tenant_id, name, slug, locale FROM dashboard.tenants WHERE tenant_id = $1",
            tenant_id,
        )
        if not existing:
            raise ValueError("Tenant not found")
        updated = {
            "tenant_id": tenant_id,
            "name": name or existing["name"],
            "slug": slug or existing["slug"],
            "locale": locale or existing["locale"],
        }
        await self._execute(
            """
            UPDATE dashboard.tenants
            SET name = $1, slug = $2, locale = $3
            WHERE tenant_id = $4
            """,
            updated["name"],
            updated["slug"],
            updated["locale"],
            updated["tenant_id"],
        )
        return Tenant(id=tenant_id, name=str(updated["name"]), slug=str(updated["slug"]))

    async def update_provider_connection(
        self,
        *,
        tenant_id: str,
        base_url: str,
        client_id: str,
        client_secret: str | None,
        status: str,
        encryption_key: str,
        display_name: str | None = None,
    ) -> dict:
        secret_value = encrypt_secret(client_secret, encryption_key) if client_secret else None
        if secret_value:
            await self._execute(
                """
                INSERT INTO dashboard.provider_connections
                    (tenant_id, kind, status, display_name, base_url, client_id, client_secret_encrypted, updated_at)
                VALUES ($1, 'client', $2, $3, $4, $5, $6, now())
                ON CONFLICT (tenant_id, kind) DO UPDATE SET
                    status = EXCLUDED.status,
                    display_name = EXCLUDED.display_name,
                    base_url = EXCLUDED.base_url,
                    client_id = EXCLUDED.client_id,
                    client_secret_encrypted = EXCLUDED.client_secret_encrypted,
                    updated_at = now()
                """,
                tenant_id,
                status,
                display_name,
                base_url,
                client_id,
                secret_value,
            )
        else:
            await self._execute(
                """
                INSERT INTO dashboard.provider_connections
                    (tenant_id, kind, status, display_name, base_url, client_id, updated_at)
                VALUES ($1, 'client', $2, $3, $4, $5, now())
                ON CONFLICT (tenant_id, kind) DO UPDATE SET
                    status = EXCLUDED.status,
                    display_name = EXCLUDED.display_name,
                    base_url = EXCLUDED.base_url,
                    client_id = EXCLUDED.client_id,
                    updated_at = now()
                """,
                tenant_id,
                status,
                display_name,
                base_url,
                client_id,
            )
        return await self.get_provider_connection(tenant_id)

    async def get_provider_connection(self, tenant_id: str) -> dict:
        row = await self._fetch_one(
            """
            SELECT tenant_id, kind, status, display_name, base_url, client_id,
                   client_secret_encrypted IS NOT NULL AS has_client_secret,
                   last_sync_at
            FROM dashboard.provider_connections
            WHERE tenant_id = $1 AND kind = 'client'
            """,
            tenant_id,
        )
        if not row:
            raise ValueError("Provider connection not found")
        return {
            "tenant_id": row["tenant_id"],
            "kind": row["kind"],
            "status": row["status"],
            "display_name": row["display_name"],
            "base_url": row["base_url"],
            "client_id": row["client_id"],
            "has_client_secret": bool(row["has_client_secret"]),
            "last_sync_at": iso_date(row["last_sync_at"]),
        }

    async def create_user_metadata(
        self,
        *,
        email: str,
        name: str | None,
        role: str,
        tenant_id: str | None,
        project_ids: list[str],
        password: str,
        company_id: str | None = None,
        tenant_ids: list[str] | None = None,
    ) -> dict:
        user_id = f"user_{uuid4().hex}"
        hashed_pw = hash_password(password)
        await self._execute(
            """
            INSERT INTO dashboard.users
                (user_id, tenant_id, email, name, role, project_ids, hashed_password,
                 status, updated_at, company_id, tenant_ids)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now(), $8, $9)
            """,
            user_id,
            tenant_id,
            email,
            name,
            role,
            project_ids,
            hashed_pw,
            company_id,
            list(tenant_ids or []),
        )
        return await self.get_user_metadata(user_id)

    async def update_user_metadata(
        self,
        user_id: str,
        *,
        name: str | None,
        role: str | None,
        tenant_id: str | None,
        project_ids: list[str] | None,
        status: str | None,
        company_id: str | None = None,
        password: str | None = None,
        tenant_ids: list[str] | None = None,
    ) -> dict:
        row = await self._fetch_one("SELECT * FROM dashboard.users WHERE user_id = $1", user_id)
        if not row:
            raise ValueError("User not found")

        resolved_tenant_ids = tenant_ids if tenant_ids is not None else list(row.get("tenant_ids") or [])

        if password is not None:
            hashed_pw = hash_password(password)
            await self._execute(
                """
                UPDATE dashboard.users
                SET name = $1,
                    role = $2,
                    tenant_id = $3,
                    project_ids = $4,
                    status = $5,
                    hashed_password = $6,
                    updated_at = now(),
                    company_id = COALESCE($8, company_id),
                    tenant_ids = $9
                WHERE user_id = $7
                """,
                name if name is not None else row["name"],
                role if role is not None else row["role"],
                tenant_id if tenant_id is not None else row["tenant_id"],
                project_ids if project_ids is not None else row["project_ids"],
                status if status is not None else row["status"],
                hashed_pw,
                user_id,
                company_id,
                resolved_tenant_ids,
            )
        else:
            await self._execute(
                """
                UPDATE dashboard.users
                SET name = $1,
                    role = $2,
                    tenant_id = $3,
                    project_ids = $4,
                    status = $5,
                    updated_at = now(),
                    company_id = COALESCE($7, company_id),
                    tenant_ids = $8
                WHERE user_id = $6
                """,
                name if name is not None else row["name"],
                role if role is not None else row["role"],
                tenant_id if tenant_id is not None else row["tenant_id"],
                project_ids if project_ids is not None else row["project_ids"],
                status if status is not None else row["status"],
                user_id,
                company_id,
                resolved_tenant_ids,
            )
        return await self.get_user_metadata(user_id)

    async def get_user_metadata(self, user_id: str) -> dict:
        row = await self._fetch_one(
            """
            SELECT user_id, tenant_id, email, name, role, project_ids, status, company_id, tenant_ids
            FROM dashboard.users
            WHERE user_id = $1
            """,
            user_id,
        )
        if not row:
            raise ValueError("User not found")
        return dict(row)

    async def list_photo_slot_labels(self, project_id: str) -> list[dict]:
        # Admin-only path: no AuthClaims arg here — the route guard
        # (_assert_company_access_to_project) already ran, so an unrestricted
        # lookup is safe.
        project = await self.get_project(project_id, tenant_ids=None)
        if not project:
            raise ValueError("Project not found")
        rows = await self._fetch_all_replica(
            """
            SELECT kind, label
            FROM dashboard.photo_slot_labels
            WHERE tenant_id = $1 AND project_id = $2
            ORDER BY kind ASC
            """,
            project.tenant_id,
            project.id,
        )
        return [dict(row) for row in rows]

    async def update_photo_slot_labels(self, project_id: str, labels: list[dict[str, str]]) -> list[dict]:
        # Admin-only path: route guard already ran; unrestricted lookup is safe.
        project = await self.get_project(project_id, tenant_ids=None)
        if not project:
            raise ValueError("Project not found")
        for item in labels:
            await self._execute(
                """
                INSERT INTO dashboard.photo_slot_labels
                    (tenant_id, project_id, kind, label, updated_at)
                VALUES ($1, $2, $3, $4, now())
                ON CONFLICT (tenant_id, project_id, kind) DO UPDATE SET
                    label = EXCLUDED.label,
                    updated_at = now()
                """,
                project.tenant_id,
                project.id,
                item["kind"],
                item["label"],
            )
        return await self.list_photo_slot_labels(project_id)

    async def list_project_metrics(self, project_id: str) -> list[dict]:
        # Admin-only path: route guard already ran; unrestricted lookup is safe.
        project = await self.get_project(project_id, tenant_ids=None)
        if not project:
            raise ValueError("Project not found")
        rows = await self._fetch_all_replica(
            """
            SELECT key, label, value, unit, category
            FROM dashboard.project_metrics
            WHERE tenant_id = $1 AND project_id = $2
            ORDER BY key ASC
            """,
            project.tenant_id,
            project.id,
        )
        return [dict(row) for row in rows]

    async def update_project_metrics(self, project_id: str, metrics: list[dict]) -> list[dict]:
        # Admin-only path: route guard already ran; unrestricted lookup is safe.
        project = await self.get_project(project_id, tenant_ids=None)
        if not project:
            raise ValueError("Project not found")
        for item in metrics:
            await self._execute(
                """
                INSERT INTO dashboard.project_metrics
                    (tenant_id, project_id, key, label, value, unit, category, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, now())
                ON CONFLICT (tenant_id, project_id, key) DO UPDATE SET
                    label = EXCLUDED.label,
                    value = EXCLUDED.value,
                    unit = EXCLUDED.unit,
                    category = EXCLUDED.category,
                    updated_at = now()
                """,
                project.tenant_id,
                project.id,
                item["key"],
                item["label"],
                item["value"],
                item.get("unit"),
                item.get("category"),
            )
        return await self.list_project_metrics(project_id)

    # ── Password-reset primitive (Groundwork) ─────────────────────────────
    #
    # These methods implement the secure token-based password-reset flow.
    # HTTP endpoints and UI are NOT wired yet (Phase 3 work). The surface here
    # is intentionally unit-testable without a live HTTP layer.

    async def issue_password_reset_token(
        self,
        *,
        user_id: str,
        tenant_id: str | None,
        ttl_seconds: int = 3600,
    ) -> str:
        """Create a password-reset token for *user_id* and return the raw token.

        The raw token is returned to the caller (to be sent out-of-band, e.g.
        via email). Only the PBKDF2-SHA256 hash is persisted in the DB.

        Any existing unexpired, unconsumed tokens for the same user are
        invalidated (consumed_at set) to enforce single-active-token semantics.

        Args:
            user_id:    The user who requested the reset.
            tenant_id:  Denormalised tenant context; may be None for admin users.
            ttl_seconds: Token lifetime in seconds (default 60 min).

        Returns:
            The raw URL-safe token string to be delivered to the user.
        """
        from uuid import uuid4
        from datetime import datetime, timezone, timedelta

        # Invalidate any existing unexpired tokens for this user.
        await self._execute(
            """
            UPDATE dashboard.password_reset_tokens
            SET consumed_at = now()
            WHERE user_id = $1
              AND consumed_at IS NULL
              AND expires_at > now()
            """,
            user_id,
        )

        raw_token = generate_reset_token()
        token_hash = hash_reset_token(raw_token)
        token_id = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

        await self._execute(
            """
            INSERT INTO dashboard.password_reset_tokens
                (token_id, user_id, tenant_id, token_hash, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            """,
            token_id,
            user_id,
            tenant_id,
            token_hash,
            expires_at,
        )
        return raw_token

    async def consume_password_reset_token(
        self,
        *,
        user_id: str,
        raw_token: str,
        new_password: str,
        tenant_id: str | None = None,
    ) -> bool:
        """Verify *raw_token* for *user_id* and, if valid, set *new_password*.

        Token semantics:
        - Must not be expired (expires_at > now()).
        - Must not have been consumed already (consumed_at IS NULL).
        - The PBKDF2 hash of *raw_token* must match the stored token_hash
          (constant-time comparison via verify_reset_token).
        - When *tenant_id* is provided it is added as an extra predicate on the
          token lookup (defense-in-depth: a cross-tenant token cannot be redeemed
          even if the user_id somehow matched).  Existing callers that omit
          *tenant_id* are unaffected.

        On success the token row is marked consumed and the user's
        hashed_password is updated atomically in the same transaction.

        Returns:
            True if the password was reset successfully.
            False if the token was invalid, expired, or already consumed.
        """
        if tenant_id is not None:
            rows = await self._fetch_all(
                """
                SELECT token_id, token_hash
                FROM dashboard.password_reset_tokens
                WHERE user_id = $1
                  AND tenant_id = $2
                  AND consumed_at IS NULL
                  AND expires_at > now()
                ORDER BY created_at DESC
                LIMIT 5
                """,
                user_id,
                tenant_id,
            )
        else:
            rows = await self._fetch_all(
                """
                SELECT token_id, token_hash
                FROM dashboard.password_reset_tokens
                WHERE user_id = $1
                  AND consumed_at IS NULL
                  AND expires_at > now()
                ORDER BY created_at DESC
                LIMIT 5
                """,
                user_id,
            )

        matched_token_id: str | None = None
        for row in rows:
            if verify_reset_token(raw_token, str(row["token_hash"])):
                matched_token_id = str(row["token_id"])
                break

        if not matched_token_id:
            return False

        new_hash = hash_password(new_password)

        # Atomically consume the token and update the password.
        # The WHERE includes consumed_at IS NULL to prevent TOCTOU:
        # two concurrent redeems race on the same token_id, but only
        # the first UPDATE matches — the second sees 0 rows and aborts.
        if self.pool is None:
            raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.execute(
                    """
                    UPDATE dashboard.password_reset_tokens
                    SET consumed_at = now()
                    WHERE token_id = $1 AND consumed_at IS NULL
                    """,
                    matched_token_id,
                )
                if result == "UPDATE 0":
                    return False
                await conn.execute(
                    """
                    UPDATE dashboard.users
                    SET hashed_password = $1, updated_at = now()
                    WHERE user_id = $2
                    """,
                    new_hash,
                    user_id,
                )
        return True

    async def update_project(
        self,
        tenant_id: str,
        project_id: str,
        name: str | None,
        start_date: str | None,
        end_date: str | None,
        client_name: str | None = None,
    ) -> Project:
        """Update mutable project fields (name, start_date, end_date, client_name).

        Only fields that are non-None are overwritten; existing values are
        preserved via COALESCE so a partial patch is safe.  The WHERE clause
        enforces tenant_id so cross-tenant writes are impossible.
        Raises ValueError when no row matched (project absent or wrong tenant).
        Uses a CTE to compute visit_count in the same query so the response
        always carries the correct count.
        """
        from datetime import date as _date
        _start = _date.fromisoformat(start_date) if start_date else None
        _end = _date.fromisoformat(end_date) if end_date else None

        row = await self._fetch_one(
            """
            WITH updated AS (
                UPDATE dashboard.projects
                SET name        = COALESCE($1, name),
                    start_date  = COALESCE($2, start_date),
                    end_date    = COALESCE($3, end_date),
                    client_name = COALESCE($6, client_name),
                    updated_at  = now()
                WHERE tenant_id = $4 AND project_id = $5
                RETURNING *
            )
            SELECT u.tenant_id, u.project_id, u.name, u.slug, u.client_name,
                   u.provider_kind, u.start_date, u.end_date,
                   COALESCE(
                       (SELECT COUNT(*) FROM dashboard.visits v
                        WHERE v.tenant_id = u.tenant_id AND v.project_id = u.project_id),
                       0
                   ) AS visit_count
            FROM updated u
            """,
            name,
            _start,
            _end,
            tenant_id,
            project_id,
            client_name,
        )
        if not row:
            raise ValueError(f"Project '{project_id}' not found for tenant '{tenant_id}'")
        return project_from_row(dict(row))

    async def get_platform_setting(self, key: str) -> str | None:
        row = await self._fetch_one(
            "SELECT value FROM dashboard.platform_settings WHERE key = $1",
            key,
        )
        return row["value"] if row else None

    async def get_platform_settings(self, keys: list[str]) -> dict[str, str]:
        rows = await self._fetch_all(
            "SELECT key, value FROM dashboard.platform_settings WHERE key = ANY($1)",
            keys,
        )
        return {row["key"]: row["value"] for row in rows}

    async def set_platform_setting(self, key: str, value: str) -> str:
        await self._execute(
            """
            INSERT INTO dashboard.platform_settings (key, value, updated_at)
            VALUES ($1, $2, now())
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
            """,
            key, value,
        )
        return value

    async def get_active_user_for_reset(self, email: str) -> dict | None:
        """Resolve an active user by email for the password-reset redeem path.

        Returns a minimal dict {user_id, tenant_id} needed by
        consume_password_reset_token, or None if the email is unknown or the
        account is not active.

        S6: Returns None for both unknown and inactive accounts so callers
        cannot distinguish the two cases (no user enumeration).
        """
        row = await self._fetch_one(
            """
            SELECT user_id, tenant_id
            FROM dashboard.users
            WHERE email = $1 AND status = 'active'
            """,
            email,
        )
        if not row:
            return None
        return {"user_id": str(row["user_id"]), "tenant_id": row.get("tenant_id")}


def project_from_row(row: dict[str, Any]) -> Project:
    return Project(
        id=str(row["project_id"]),
        tenant_id=str(row["tenant_id"]),
        name=str(row["name"]),
        slug=str(row["slug"]),
        client_name=str(row["client_name"]),
        provider_kind=str(row.get("provider_kind") or "fake_shopmetrics"),
        start_date=iso_date(row.get("start_date")),
        end_date=iso_date(row.get("end_date")),
        visit_count=int(row.get("visit_count") or 0),
    )


def company_from_row(row: dict[str, Any]) -> Company:
    return Company(
        id=str(row["company_id"]),
        name=str(row["name"]),
        slug=str(row["slug"]),
        status=row.get("status", "active"),
    )


def tenant_from_row(row: dict[str, Any]) -> Tenant:
    return Tenant(
        id=str(row["tenant_id"]),
        name=str(row["name"]),
        slug=str(row["slug"]),
        country=row.get("locale"),
        company_id=row.get("company_id"),
    )


def metric_from_row(row: dict[str, Any]) -> ProjectMetric:
    return ProjectMetric(
        key=str(row["key"]),
        label=str(row["label"]),
        value=float(row["value"]),
        unit=row.get("unit"),
        category=row.get("category"),
    )


def dashboard_layout_from_row(row: dict[str, Any]) -> DashboardLayout:
    raw_layout = row["layout_json"]
    layout = json.loads(raw_layout) if isinstance(raw_layout, str) else raw_layout
    return DashboardLayout(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        layout=layout,
        page_key=str(row.get("page_key") or "overview"),
        source=str(row["source"]),
        updated_by=row.get("updated_by"),
        updated_at=row.get("updated_at"),
    )


def visit_from_row(row: dict[str, Any]) -> Visit:
    return Visit(
        instance_id=str(row["survey_id"]),
        project_id=str(row["project_id"]),
        tenant_id=str(row["tenant_id"]),
        store_id=str(row["store_id"]),
        store_name=str(row["store_name"]),
        address=row.get("address"),
        city=row.get("city"),
        visit_date=iso_date(row["visit_date"]) or str(row["visit_date"]),
        visit_time=row.get("visit_time"),
        clerk_name=row.get("clerk_name"),
        install1=row.get("install1"),
        install2=row.get("install2"),
        install3=row.get("install3"),
        install4=row.get("install4"),
        overall_notes=row.get("overall_notes"),
    )


def photo_from_row(row: dict[str, Any]) -> VisitPhoto:
    return VisitPhoto(
        instance_id=str(row["survey_id"]),
        project_id=str(row["project_id"]),
        tenant_id=str(row["tenant_id"]),
        kind=str(row["kind"]),
        url=str(row["url"]),
        caption=row.get("caption"),
    )


def user_from_row(row: dict[str, Any]) -> User:
    return User(
        id=str(row["user_id"]),
        email=str(row["email"]),
        name=row.get("name"),
        role=resolve_role(str(row["role"])),
        tenant_id=row.get("tenant_id"),
        hashed_password="",
        company_id=row.get("company_id"),
        project_ids=tuple(row.get("project_ids") or []),
        tenant_ids=tuple(row.get("tenant_ids") or []),
    )


def run_log_from_row(row: dict[str, Any]) -> RunLog:
    return RunLog(
        id=str(row["run_id"]),
        tenant_id=str(row["tenant_id"]),
        status=str(row["status"]),
        started_at=to_datetime(row["started_at"]),
        finished_at=to_datetime(row.get("finished_at")) if row.get("finished_at") else None,
        rows_pulled=int(row.get("rows_pulled") or 0),
        error_message=row.get("error_message"),
    )


def iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))
