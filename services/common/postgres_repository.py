from __future__ import annotations

import json
from typing import Any

from datetime import datetime
from uuid import uuid4

import asyncpg

from .models import AuthClaims, DistributionEntry, InstallCategory, InstallSlot, Project, ProjectMetric, ProjectSummary, Role, RunLog, Tenant, User, Visit, VisitPhoto
from .repository import DashboardRepository, seed_phase01_repository, to_client_visit_dict, to_public_dict
from .secrets import encrypt_secret
from .security import hash_password, hash_reset_token, verify_password, verify_reset_token, generate_reset_token
from .tenancy import assert_project_access


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
    ) -> None:
        self.database_url = database_url
        self.read_replica_url = read_replica_url
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout
        self.pool: asyncpg.Pool | None = None
        self.replica_pool: asyncpg.Pool | None = None
        self.auth_repository = auth_repository or seed_phase01_repository()

    async def initialize_pool(self) -> None:
        """Create the connection pool. Call on application startup."""
        self.pool = await asyncpg.create_pool(
            dsn=self.database_url,
            min_size=self.min_size,
            max_size=self.max_size,
            timeout=self.timeout,
        )
        if self.read_replica_url:
            try:
                self.replica_pool = await asyncpg.create_pool(
                    dsn=self.read_replica_url,
                    min_size=self.min_size,
                    max_size=self.max_size,
                    timeout=self.timeout,
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
            SELECT user_id, tenant_id, email, name, role, project_ids, hashed_password, status
            FROM dashboard.users
            WHERE email = $1 AND status = 'active'
            """,
            email,
        )

        stored_hash = (row or {}).get("hashed_password") or self._DUMMY_HASH
        # Always verify — if the row is missing or has no hash, the dummy hash
        # will not match, keeping the timing profile identical.
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
        )

    async def list_projects(self, claims: AuthClaims) -> list[Project]:
        if claims.role == Role.ADMIN:
            rows = await self._fetch_all(
                """
                SELECT p.tenant_id, p.project_id, p.name, p.slug, p.client_name,
                       p.provider_kind, p.start_date, p.end_date,
                       COALESCE((
                           SELECT COUNT(*)
                           FROM dashboard.visits v
                           WHERE v.tenant_id = p.tenant_id
                             AND v.project_id = p.project_id
                       ), 0) AS visit_count
                FROM dashboard.projects p
                ORDER BY p.name ASC
                """
            )
        else:
            if claims.tenant_id is None or not claims.project_ids:
                return []
            rows = await self._fetch_all(
                """
                SELECT p.tenant_id, p.project_id, p.name, p.slug, p.client_name,
                       p.provider_kind, p.start_date, p.end_date,
                       COALESCE((
                           SELECT COUNT(*)
                           FROM dashboard.visits v
                           WHERE v.tenant_id = p.tenant_id
                             AND v.project_id = p.project_id
                       ), 0) AS visit_count
                FROM dashboard.projects p
                WHERE p.tenant_id = $1 AND p.project_id = ANY($2)
                ORDER BY p.name ASC
                """,
                claims.tenant_id,
                list(claims.project_ids),
            )
        return [project_from_row(row) for row in rows]

    async def get_project(self, project_id: str) -> Project | None:
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
        return project_from_row(row) if row else None

    async def get_project_summary(self, claims: AuthClaims, project_id: str) -> ProjectSummary:
        project = assert_project_access(claims, await self.get_project(project_id))

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
            rows_without_photos AS (
                SELECT COUNT(*) as cnt
                FROM dashboard.visits v
                WHERE tenant_id = $1 AND project_id = $2
                AND NOT EXISTS (
                    SELECT 1 FROM dashboard.visit_photos vp
                    WHERE vp.tenant_id = v.tenant_id
                    AND vp.project_id = v.project_id
                    AND vp.survey_id = v.survey_id
                )
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

        # P1.4: Compute per-slot distributions and success counts
        install_slots: list[InstallSlot] = []
        install_columns = ["install1", "install2", "install3", "install4"]

        for slot_row in slot_rows:
            si = int(slot_row["slot_index"])
            col = install_columns[si - 1] if si <= 4 else None
            if not col:
                continue

            # Query distribution for this install column
            dist_rows = await self._fetch_all_replica(
                f"""
                SELECT {col} as answer, COUNT(*) as cnt
                FROM dashboard.visits
                WHERE tenant_id = $1 AND project_id = $2 AND {col} IS NOT NULL
                GROUP BY {col}
                ORDER BY cnt DESC
                """,
                project.tenant_id,
                project.id,
            )

            distribution: list[DistributionEntry] = []
            success_count = 0
            slot_success = success_map.get(si, {})

            for drow in dist_rows:
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

    async def list_visits(self, claims: AuthClaims, project_id: str) -> list[dict]:
        """List visits with photo_count computed."""
        project = assert_project_access(claims, await self.get_project(project_id))

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
            """,
            project.tenant_id,
            project.id,
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

    async def get_visit(self, claims: AuthClaims, project_id: str, instance_id: str) -> Visit | None:
        project = assert_project_access(claims, await self.get_project(project_id))
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
        project = assert_project_access(claims, await self.get_project(project_id))
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
            "SELECT tenant_id, name, slug, locale FROM dashboard.tenants ORDER BY name ASC"
        )
        return [
            Tenant(
                id=str(row["tenant_id"]),
                name=str(row["name"]),
                slug=str(row["slug"]),
                country=None,
            )
            for row in rows
        ]

    async def list_users(self) -> list[User]:
        rows = await self._fetch_all_replica(
            """
            SELECT user_id, tenant_id, email, name, role, project_ids
            FROM dashboard.users
            ORDER BY email ASC
            """
        )
        if not rows:
            return self.auth_repository.list_users()
        return [user_from_row(row) for row in rows]

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
    ) -> dict:
        user_id = f"user_{uuid4().hex}"
        hashed_pw = hash_password(password)
        await self._execute(
            """
            INSERT INTO dashboard.users
                (user_id, tenant_id, email, name, role, project_ids, hashed_password, status, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now())
            """,
            user_id,
            tenant_id,
            email,
            name,
            role,
            project_ids,
            hashed_pw,
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
        password: str | None = None,
    ) -> dict:
        row = await self._fetch_one("SELECT * FROM dashboard.users WHERE user_id = $1", user_id)
        if not row:
            raise ValueError("User not found")

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
                    updated_at = now()
                WHERE user_id = $7
                """,
                name if name is not None else row["name"],
                role if role is not None else row["role"],
                tenant_id if tenant_id is not None else row["tenant_id"],
                project_ids if project_ids is not None else row["project_ids"],
                status if status is not None else row["status"],
                hashed_pw,
                user_id,
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
                    updated_at = now()
                WHERE user_id = $6
                """,
                name if name is not None else row["name"],
                role if role is not None else row["role"],
                tenant_id if tenant_id is not None else row["tenant_id"],
                project_ids if project_ids is not None else row["project_ids"],
                status if status is not None else row["status"],
                user_id,
            )
        return await self.get_user_metadata(user_id)

    async def get_user_metadata(self, user_id: str) -> dict:
        row = await self._fetch_one(
            """
            SELECT user_id, tenant_id, email, name, role, project_ids, status
            FROM dashboard.users
            WHERE user_id = $1
            """,
            user_id,
        )
        if not row:
            raise ValueError("User not found")
        return dict(row)

    async def list_photo_slot_labels(self, project_id: str) -> list[dict]:
        project = await self.get_project(project_id)
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
        project = await self.get_project(project_id)
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
        project = await self.get_project(project_id)
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
        project = await self.get_project(project_id)
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
        if self.pool is None:
            raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    UPDATE dashboard.password_reset_tokens
                    SET consumed_at = now()
                    WHERE token_id = $1
                    """,
                    matched_token_id,
                )
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
    ) -> Project:
        """Update mutable project fields (name, start_date, end_date).

        Only fields that are non-None are overwritten; existing values are
        preserved via COALESCE so a partial patch is safe.  The WHERE clause
        enforces tenant_id so cross-tenant writes are impossible.
        Raises ValueError when no row matched (project absent or wrong tenant).
        """
        row = await self._fetch_one(
            """
            UPDATE dashboard.projects
            SET name       = COALESCE($1, name),
                start_date = COALESCE($2::date, start_date),
                end_date   = COALESCE($3::date, end_date),
                updated_at = now()
            WHERE tenant_id = $4 AND project_id = $5
            RETURNING tenant_id, project_id, name, slug, client_name,
                      provider_kind, start_date, end_date
            """,
            name,
            start_date,
            end_date,
            tenant_id,
            project_id,
        )
        if not row:
            raise ValueError(f"Project '{project_id}' not found for tenant '{tenant_id}'")
        return project_from_row(dict(row))

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


def metric_from_row(row: dict[str, Any]) -> ProjectMetric:
    return ProjectMetric(
        key=str(row["key"]),
        label=str(row["label"]),
        value=float(row["value"]),
        unit=row.get("unit"),
        category=row.get("category"),
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
        role=Role(str(row["role"])),
        tenant_id=row.get("tenant_id"),
        hashed_password="",
        project_ids=tuple(row.get("project_ids") or []),
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
