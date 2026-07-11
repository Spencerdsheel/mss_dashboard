from __future__ import annotations

import json
import time
import traceback
import uuid
from datetime import datetime, timezone

from services.common.logging_config import get_logger
from services.common.secrets import decrypt_secret
from services.common.settings import load_settings
from services.ingestion.celery_app import celery_app
from services.ingestion.client import ShopmetricsClient, ShopmetricsCredentials, HttpxTransport
from services.ingestion.extractor import ExtractorRequest, ShopmetricsExtractor
from services.ingestion.transform import TransformContext, transform_shopmetrics_rowsets
from services.ingestion.persistence import load_transformed_dataset

logger = get_logger(__name__)


_task_redis_client: "redis.Redis | None" = None


def _get_task_redis_client() -> "redis.Redis | None":
    """Return a shared sync Redis client for Celery task operations."""
    import redis as _redis

    global _task_redis_client
    settings = load_settings()
    if not settings.redis_url:
        return None
    if _task_redis_client is None:
        _task_redis_client = _redis.from_url(
            settings.redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2,
        )
    return _task_redis_client


def _invalidate_tenant_cache(tenant_id: str) -> None:
    """Invalidate all cache entries for a tenant after refresh.

    Set-based invalidation (Task 2.8): every cache key written for this
    tenant is tracked in the `t:{tenant_id}:keys` Redis SET (see
    CacheAside.set / set_swr). Deleting that set's members is O(keys for
    this tenant) — no full-keyspace SCAN, which would be O(all keys) and
    contend with every other tenant's traffic on a shared Redis instance.
    """
    client = _get_task_redis_client()
    if client is None:
        return
    try:
        set_key = f"t:{tenant_id}:keys"
        keys = client.smembers(set_key)
        if keys:
            client.delete(*keys)
        client.delete(set_key)
        logger.info(f"Cache invalidated for tenant {tenant_id}")
    except Exception as exc:
        logger.warning(f"Cache invalidation failed for tenant {tenant_id}: {exc}")


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def run_tenant_refresh(self, tenant_id: str, database_url: str) -> dict:
    """Run data refresh for a single tenant.

    This task runs the full ingestion pipeline:
    1. Fetch provider connection
    2. Authenticate with Shopmetrics
    3. Extract all resources
    4. Transform and load into database
    5. Update run log and provider sync status
    """
    run_id = f"run_{uuid.uuid4().hex}"
    started_at = datetime.now(timezone.utc)
    start_time = time.monotonic()

    try:
        # Get provider connection
        connection = _get_provider_connection(database_url, tenant_id)
        if not connection:
            raise RuntimeError("Provider connection is not configured for this tenant")
        if connection.get("status") != "active":
            raise RuntimeError("Provider connection must be active before refresh")

        # Get project for this tenant
        project = _get_first_project(database_url, tenant_id)
        if not project:
            raise RuntimeError("No project exists for this tenant")

        # Decrypt client secret
        settings = load_settings()
        client_secret = decrypt_secret(
            connection["client_secret_encrypted"],
            settings.secret_encryption_key,
        )

        # Create Shopmetrics client and extractor
        credentials = ShopmetricsCredentials(
            base_url=connection["base_url"],
            client_id=connection["client_id"],
            client_secret=client_secret,
        )
        client = ShopmetricsClient(credentials, transport=HttpxTransport())
        extractor = ShopmetricsExtractor(client)

        # Extract all resources via the client API
        client_id = int(connection.get("client_id", "1001"))
        config = connection.get("config") or {}
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except (json.JSONDecodeError, TypeError):
                config = {}
        form_id = int(config.get("form_id", 2001))
        rowsets = extractor.pull(ExtractorRequest(
            client_ids=[-client_id],
            form_ids=[form_id],
            include_reference=True,
            include_transactional=True,
        ))

        # Transform
        context = TransformContext(
            tenant_id=tenant_id,
            project_id=project["project_id"],
            client_name=project["client_name"],
            client_slug=project["client_slug"],
            project_name=project["project_name"],
            project_slug=project["project_slug"],
        )
        transformed = transform_shopmetrics_rowsets(rowsets, context)

        # Load into database
        load_transformed_dataset(transformed, database_url)

        rows_pulled = sum(len(rows) for rows in transformed.raw_rowsets.values())

        # Record success
        _finish_run(
            database_url,
            run_id,
            tenant_id,
            "success",
            started_at,
            rows_pulled=rows_pulled,
            details={"visits": len(transformed.visits), "photos": len(transformed.photos)},
        )
        _mark_provider_synced(database_url, tenant_id)
        _invalidate_tenant_cache(tenant_id)

        duration = time.monotonic() - start_time
        try:
            from services.api.metrics import ingestion_duration_seconds
            ingestion_duration_seconds.labels(tenant_id=tenant_id, status="success").observe(duration)
        except ImportError:
            pass

        logger.info(f"Refresh completed for tenant {tenant_id}: {rows_pulled} rows pulled")
        return {
            "run_id": run_id,
            "tenant_id": tenant_id,
            "status": "success",
            "rows_pulled": rows_pulled,
        }

    except Exception as exc:
        logger.error(f"Refresh failed for tenant {tenant_id}: {exc}")

        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

        # Max retries exceeded - record failure
        _finish_run(
            database_url,
            run_id,
            tenant_id,
            "failed",
            started_at,
            rows_pulled=0,
            error_message=str(exc),
            details={"trace": traceback.format_exc(limit=3)},
        )

        duration = time.monotonic() - start_time
        try:
            from services.api.metrics import ingestion_duration_seconds
            ingestion_duration_seconds.labels(tenant_id=tenant_id, status="failed").observe(duration)
        except ImportError:
            pass

        return {
            "run_id": run_id,
            "tenant_id": tenant_id,
            "status": "failed",
            "error_message": str(exc),
        }


@celery_app.task
def scheduled_refresh_all_tenants() -> dict:
    """Scheduled task: refresh all active tenants.

    Triggered by Celery Beat on a configurable schedule.
    """
    settings = load_settings()
    database_url = settings.database_url

    active_tenants = _get_active_tenants(database_url)
    results = []
    redis_client = _get_task_redis_client()

    for tenant_id in active_tenants:
        if redis_client is not None:
            try:
                val = redis_client.get(f"scheduled_refresh:{tenant_id}")
                if val == "0":
                    results.append({
                        "tenant_id": tenant_id,
                        "status": "disabled",
                    })
                    continue
            except Exception:
                pass

        try:
            result = run_tenant_refresh.delay(tenant_id, database_url)
            results.append({
                "tenant_id": tenant_id,
                "task_id": result.id,
                "status": "queued",
            })
            logger.info(f"Queued scheduled refresh for tenant {tenant_id}")
        except Exception as exc:
            logger.error(f"Failed to queue refresh for tenant {tenant_id}: {exc}")
            results.append({
                "tenant_id": tenant_id,
                "status": "error",
                "error_message": str(exc),
            })

    return {
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "tenants_queued": len(results),
        "results": results,
    }


# Helper functions (sync for Celery task compatibility)

def _get_provider_connection(database_url: str, tenant_id: str) -> dict | None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT tenant_id, kind, status, base_url, client_id, client_secret_encrypted, config
                FROM dashboard.provider_connections
                WHERE tenant_id = %s AND kind = 'client'
                """,
                (tenant_id,),
            )
            return cursor.fetchone()


def _get_first_project(database_url: str, tenant_id: str) -> dict | None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.project_id,
                    p.name AS project_name,
                    p.slug AS project_slug,
                    p.client_name,
                    t.slug AS client_slug
                FROM dashboard.projects p
                JOIN dashboard.tenants t ON t.tenant_id = p.tenant_id
                WHERE p.tenant_id = %s
                ORDER BY p.created_at ASC
                LIMIT 1
                """,
                (tenant_id,),
            )
            return cursor.fetchone()


def _get_active_tenants(database_url: str) -> list[str]:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT t.tenant_id
                FROM dashboard.tenants t
                JOIN dashboard.provider_connections pc ON pc.tenant_id = t.tenant_id
                WHERE pc.kind = 'client' AND pc.status = 'active'
                ORDER BY t.tenant_id ASC
                """,
            )
            return [row["tenant_id"] for row in cursor.fetchall()]


def _finish_run(
    database_url: str,
    run_id: str,
    tenant_id: str,
    status: str,
    started_at: datetime,
    *,
    rows_pulled: int,
    error_message: str | None = None,
    details: dict | None = None,
) -> None:
    import psycopg

    run_details = details or {}
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO dashboard.run_logs
                    (run_id, tenant_id, kind, status, started_at, finished_at,
                     rows_pulled, error_message, details)
                VALUES (%s, %s, 'celery_refresh', %s, %s, now(), %s, %s, %s)
                """,
                (
                    run_id,
                    tenant_id,
                    status,
                    started_at,
                    rows_pulled,
                    error_message,
                    json.dumps(run_details),
                ),
            )
        conn.commit()


def _mark_provider_synced(database_url: str, tenant_id: str) -> None:
    import psycopg

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE dashboard.provider_connections
                SET last_sync_at = now(), updated_at = now()
                WHERE tenant_id = %s
                """,
                (tenant_id,),
            )
        conn.commit()
