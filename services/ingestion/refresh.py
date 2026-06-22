from __future__ import annotations

import json
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from services.common.logging_config import get_correlation_id
from services.ingestion.transform import TransformContext, transform_shopmetrics_rowsets
from services.ingestion.persistence import load_transformed_dataset


class RefreshError(Exception):
    """Raised when a manual refresh cannot be started or completed."""


@dataclass(frozen=True)
class RefreshResult:
    run_id: str
    tenant_id: str
    status: str
    rows_pulled: int
    error_message: str | None = None


def run_manual_refresh(database_url: str, tenant_id: str) -> RefreshResult:
    run_id = f"run_{uuid.uuid4().hex}"
    correlation_id = get_correlation_id()
    started_at = datetime.now(timezone.utc)
    try:
        connection_info = get_provider_connection(database_url, tenant_id)
        if not connection_info:
            raise RefreshError("Provider connection is not configured for this tenant")
        if connection_info.get("status") != "active":
            raise RefreshError("Provider connection must be active before refresh")
        if not connection_info.get("client_secret_encrypted"):
            raise RefreshError("Provider client secret is missing")

        project = get_first_project(database_url, tenant_id)
        if not project:
            raise RefreshError("No project exists for this tenant")

        from services.common.secrets import decrypt_secret
        from services.common.settings import load_settings
        from services.ingestion.client import ShopmetricsClient, ShopmetricsCredentials, HttpxTransport
        from services.ingestion.extractor import ExtractorRequest, ShopmetricsExtractor

        settings = load_settings()
        client_secret = decrypt_secret(connection_info["client_secret_encrypted"], settings.secret_encryption_key)

        credentials = ShopmetricsCredentials(
            base_url=connection_info["base_url"],
            client_id=connection_info["client_id"],
            client_secret=client_secret,
        )
        client = ShopmetricsClient(credentials, transport=HttpxTransport())
        extractor = ShopmetricsExtractor(client)

        client_id = int(connection_info.get("client_id", "1001"))
        config = connection_info.get("config") or {}
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

        transformed = transform_shopmetrics_rowsets(
            rowsets,
            TransformContext(
                tenant_id=tenant_id,
                project_id=project["project_id"],
                client_name=project["client_name"],
                client_slug=project["client_slug"],
                project_name=project["project_name"],
                project_slug=project["project_slug"],
            ),
        )
        load_transformed_dataset(transformed, database_url)
        rows_pulled = sum(len(rows) for rows in transformed.raw_rowsets.values())
        finish_run(
            database_url,
            run_id,
            tenant_id,
            "success",
            started_at,
            rows_pulled=rows_pulled,
            details={"visits": len(transformed.visits), "photos": len(transformed.photos)},
            correlation_id=correlation_id,
        )
        mark_provider_synced(database_url, tenant_id)
        return RefreshResult(run_id, tenant_id, "success", rows_pulled)
    except Exception as exc:
        finish_run(
            database_url,
            run_id,
            tenant_id,
            "failed",
            started_at,
            rows_pulled=0,
            error_message=str(exc),
            details={"trace": traceback.format_exc(limit=3)},
            correlation_id=correlation_id,
        )
        return RefreshResult(run_id, tenant_id, "failed", 0, str(exc))


def get_provider_connection(database_url: str, tenant_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        database_url,
        """
        SELECT tenant_id, kind, status, base_url, client_id, client_secret_encrypted, config
        FROM dashboard.provider_connections
        WHERE tenant_id = %s AND kind = 'client'
        """,
        (tenant_id,),
    )
    return row


def get_first_project(database_url: str, tenant_id: str) -> dict[str, str] | None:
    row = fetch_one(
        database_url,
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
    return row


def finish_run(
    database_url: str,
    run_id: str,
    tenant_id: str,
    status: str,
    started_at: datetime,
    *,
    rows_pulled: int,
    error_message: str | None = None,
    details: dict[str, Any] | None = None,
    correlation_id: str | None = None,
) -> None:
    run_details = details or {}
    if correlation_id:
        run_details["correlation_id"] = correlation_id
    execute(
        database_url,
        """
        INSERT INTO dashboard.run_logs
            (run_id, tenant_id, kind, status, started_at, finished_at,
             rows_pulled, error_message, details)
        VALUES (%s, %s, 'manual_refresh', %s, %s, now(), %s, %s, %s)
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


def mark_provider_synced(database_url: str, tenant_id: str) -> None:
    execute(
        database_url,
        """
        UPDATE dashboard.provider_connections
        SET last_sync_at = now(), updated_at = now()
        WHERE tenant_id = %s AND kind = 'client'
        """,
        (tenant_id,),
    )


def fetch_one(database_url: str, query: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
    rows = fetch_all(database_url, query, params)
    return rows[0] if rows else None


def fetch_all(database_url: str, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return list(cursor.fetchall())


def execute(database_url: str, query: str, params: tuple[Any, ...]) -> None:
    import psycopg

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
        connection.commit()
