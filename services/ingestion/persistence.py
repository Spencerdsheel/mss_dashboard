"""P1.4: Persistence layer for ingestion — upserts transformed data into Postgres.

Extracted from the dead Excel path (transform_local_dummy_db.py) so the live
ingestion pipeline (refresh.py / tasks.py) can persist DashboardVisit/Photo/
Metric objects without any Excel coupling.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from services.ingestion.transform import (
    DashboardMetric,
    DashboardPhoto,
    DashboardVisit,
    TransformContext,
    TransformedDataset,
)
from services.common.models import InstallCategory, InstallSlot


def load_transformed_dataset(dataset: TransformedDataset, database_url: str) -> None:
    """Persist a fully transformed dataset into the dashboard schema."""
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "psycopg is required to load transformed dashboard tables. "
            "Install backend dependencies with `pip install -r requirements-backend.txt`."
        ) from exc

    schema_path = Path(__file__).with_name("dashboard_schema.sql")
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema_path.read_text(encoding="utf-8"))
            upsert_project_context(cursor, dataset)
            upsert_raw_rowsets(cursor, dataset)
            upsert_visits(cursor, dataset)
            replace_photos(cursor, dataset)
            upsert_metrics(cursor, dataset)
            upsert_campaign_config(cursor, dataset)
            upsert_local_admin_metadata(cursor, dataset)
        connection.commit()


def upsert_project_context(cursor, dataset: TransformedDataset) -> None:
    ctx = dataset.context
    dates = sorted(visit.visit_date for visit in dataset.visits)
    cursor.execute(
        """
        INSERT INTO dashboard.tenants (tenant_id, name, slug, locale)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (tenant_id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            locale = EXCLUDED.locale
        """,
        (ctx.tenant_id, ctx.client_name, ctx.client_slug, ctx.locale),
    )
    cursor.execute(
        """
        INSERT INTO dashboard.projects
            (tenant_id, project_id, name, slug, client_name, provider_kind, start_date, end_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (tenant_id, project_id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            client_name = EXCLUDED.client_name,
            provider_kind = EXCLUDED.provider_kind,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date
        """,
        (
            ctx.tenant_id,
            ctx.project_id,
            ctx.project_name,
            ctx.project_slug,
            ctx.client_name,
            "client",
            dates[0] if dates else None,
            dates[-1] if dates else None,
        ),
    )


def upsert_raw_rowsets(cursor, dataset: TransformedDataset) -> None:
    ctx = dataset.context
    for resource_name, rows in dataset.raw_rowsets.items():
        cursor.execute(
            """
            INSERT INTO dashboard.raw_rowsets
                (tenant_id, project_id, resource_name, rows_json, loaded_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (tenant_id, project_id, resource_name) DO UPDATE SET
                rows_json = EXCLUDED.rows_json,
                loaded_at = now()
            """,
            (ctx.tenant_id, ctx.project_id, resource_name, json.dumps(rows, ensure_ascii=False)),
        )


def upsert_visits(cursor, dataset: TransformedDataset) -> None:
    for visit in dataset.visits:
        data = asdict(visit)
        cursor.execute(
            """
            INSERT INTO dashboard.visits
                (tenant_id, project_id, survey_id, store_id, store_name, address, city,
                 visit_date, visit_time, clerk_name, install1, install2, install3,
                 install4, overall_notes, updated_at)
            VALUES
                (%(tenant_id)s, %(project_id)s, %(survey_id)s, %(store_id)s,
                 %(store_name)s, %(address)s, %(city)s, %(visit_date)s,
                 %(visit_time)s, %(clerk_name)s, %(install1)s, %(install2)s,
                 %(install3)s, %(install4)s, %(overall_notes)s, now())
            ON CONFLICT (tenant_id, project_id, survey_id) DO UPDATE SET
                store_id = EXCLUDED.store_id,
                store_name = EXCLUDED.store_name,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                visit_date = EXCLUDED.visit_date,
                visit_time = EXCLUDED.visit_time,
                clerk_name = EXCLUDED.clerk_name,
                install1 = EXCLUDED.install1,
                install2 = EXCLUDED.install2,
                install3 = EXCLUDED.install3,
                install4 = EXCLUDED.install4,
                overall_notes = EXCLUDED.overall_notes,
                updated_at = now()
            """,
            data,
        )


def replace_photos(cursor, dataset: TransformedDataset) -> None:
    ctx = dataset.context
    cursor.execute(
        "DELETE FROM dashboard.visit_photos WHERE tenant_id = %s AND project_id = %s",
        (ctx.tenant_id, ctx.project_id),
    )
    for photo in dataset.photos:
        cursor.execute(
            """
            INSERT INTO dashboard.visit_photos
                (tenant_id, project_id, survey_id, kind, url, caption, updated_at)
            VALUES
                (%(tenant_id)s, %(project_id)s, %(survey_id)s, %(kind)s,
                 %(url)s, %(caption)s, now())
            ON CONFLICT (tenant_id, project_id, survey_id, kind, url) DO UPDATE SET
                caption = EXCLUDED.caption,
                updated_at = now()
            """,
            asdict(photo),
        )


def upsert_metrics(cursor, dataset: TransformedDataset) -> None:
    for metric in dataset.metrics:
        cursor.execute(
            """
            INSERT INTO dashboard.project_metrics
                (tenant_id, project_id, key, label, value, unit, category, updated_at)
            VALUES
                (%(tenant_id)s, %(project_id)s, %(key)s, %(label)s, %(value)s,
                 %(unit)s, %(category)s, now())
            ON CONFLICT (tenant_id, project_id, key) DO UPDATE SET
                label = EXCLUDED.label,
                value = EXCLUDED.value,
                unit = EXCLUDED.unit,
                category = EXCLUDED.category,
                updated_at = now()
            """,
            asdict(metric),
        )


def upsert_campaign_config(
    cursor,
    dataset: TransformedDataset,
    slots: list[InstallSlot] | None = None,
    categories: list[InstallCategory] | None = None,
) -> None:
    """Upsert per-project campaign config (install slots + categories).

    If slots/categories are not provided, they are extracted from the raw
    rowsets' form_question_answers resource.
    """
    ctx = dataset.context
    tid, pid = ctx.tenant_id, ctx.project_id

    if slots is None or categories is None:
        slots, categories = _extract_campaign_from_rowsets(dataset.raw_rowsets)

    for slot in slots:
        cursor.execute(
            """
            INSERT INTO dashboard.project_install_slots
                (tenant_id, project_id, slot_index, title, question, target, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (tenant_id, project_id, slot_index) DO UPDATE SET
                title = EXCLUDED.title,
                question = EXCLUDED.question,
                target = EXCLUDED.target,
                updated_at = now()
            """,
            (tid, pid, slot.slot_index, slot.title, slot.question, slot.target),
        )

    for cat in categories:
        cursor.execute(
            """
            INSERT INTO dashboard.project_install_categories
                (tenant_id, project_id, slot_index, position, label, is_success)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, project_id, slot_index, position) DO UPDATE SET
                label = EXCLUDED.label,
                is_success = EXCLUDED.is_success
            """,
            (tid, pid, cat.slot_index, cat.position, cat.label, cat.is_success),
        )


def _extract_campaign_from_rowsets(
    raw_rowsets: dict[str, list[dict[str, Any]]],
) -> tuple[list[InstallSlot], list[InstallCategory]]:
    """Derive campaign config dynamically from form_elements + form_question_answers rowsets.

    Maps question IDs to slot indices:
      88702 (install1) → slot 1
      88703 (install2) → slot 2
      88704 (install3) → slot 3
      88705 (install4) → slot 4

    Per-slot title, question text, and target are read from form_elements
    (which now emit Title and Target fields for install elements).

    Per-category is_success is read from form_question_answers (IsSuccess field).
    """
    QUESTION_TO_SLOT = {88702: 1, 88703: 2, 88704: 3, 88705: 4}

    # Build slot metadata from form_elements (Title, Text=question, Target per element)
    slot_meta: dict[int, dict[str, Any]] = {}
    for elem in raw_rowsets.get("form_elements", []):
        eid = int(elem.get("ElementID", 0))
        if eid not in QUESTION_TO_SLOT:
            continue
        slot_idx = QUESTION_TO_SLOT[eid]
        slot_meta[slot_idx] = {
            "title": str(elem.get("Title") or f"Install {slot_idx}"),
            "question": str(elem.get("Text") or ""),
            "target": elem.get("Target"),
        }

    form_answers = raw_rowsets.get("form_question_answers", [])

    slots_map: dict[int, InstallSlot] = {}
    categories: list[InstallCategory] = []

    for row in form_answers:
        qid = int(row.get("QuestionID", 0))
        if qid not in QUESTION_TO_SLOT:
            continue
        slot_idx = QUESTION_TO_SLOT[qid]
        position = int(row.get("Position", 0))
        text = str(row.get("Text", ""))
        is_success = bool(row.get("IsSuccess", False))

        if slot_idx not in slots_map:
            meta = slot_meta.get(slot_idx, {})
            slots_map[slot_idx] = InstallSlot(
                slot_index=slot_idx,
                title=meta.get("title", f"Install {slot_idx}"),
                question=meta.get("question", ""),
                target=meta.get("target"),
            )

        categories.append(InstallCategory(
            slot_index=slot_idx,
            position=position,
            label=text,
            is_success=is_success,
        ))

    return list(slots_map.values()), categories


def upsert_local_admin_metadata(cursor, dataset: TransformedDataset) -> None:
    ctx = dataset.context
    cursor.execute(
        """
        INSERT INTO dashboard.provider_connections
            (tenant_id, kind, status, base_url, client_id, config, updated_at)
        VALUES
            (%s, 'client', 'active', %s, %s, %s, now())
        ON CONFLICT (tenant_id, kind) DO UPDATE SET
            status = EXCLUDED.status,
            base_url = EXCLUDED.base_url,
            client_id = EXCLUDED.client_id,
            config = EXCLUDED.config,
            updated_at = now()
        """,
        (
            ctx.tenant_id,
            "http://localhost:8020",
            ctx.tenant_id.replace("tenant_", ""),
            json.dumps({"form_id": 2001}),
        ),
    )
    labels = [
        ("STOREFRONT", "Storefront"),
        ("PHOTO_1", "Photo 1"),
        ("PHOTO_2", "Photo 2"),
        ("PHOTO_3", "Photo 3"),
        ("PHOTO_4", "Photo 4"),
        ("PHOTO_5", "Photo 5"),
        ("PHOTO_6", "Photo 6"),
        ("PHOTO_7", "Photo 7"),
        ("PHOTO_8", "Photo 8"),
        ("PHOTO_9", "Photo 9"),
    ]
    for kind, label in labels:
        cursor.execute(
            """
            INSERT INTO dashboard.photo_slot_labels
                (tenant_id, project_id, kind, label, updated_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (tenant_id, project_id, kind) DO NOTHING
            """,
            (ctx.tenant_id, ctx.project_id, kind, label),
        )
