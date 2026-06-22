"""P1.4: Transform Shopmetrics API rowsets into dashboard-ready objects.

Removes the dead English→French INSTALL*_MAP indirection. The form's answer
text is passed straight through to the install{n} column — the vocabulary is
English end-to-end.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


# P1.4: Question IDs and form constants
# Must match client_api.py _build_question_id_map exactly:
#   clerk 88701, install1 88702, install2 88703, install3 88704,
#   install4 88705, overall_notes 88706
FORM_ID = 2001
QUESTION_IDS = {
    "clerk": 88701,
    "install1": 88702,
    "install2": 88703,
    "install3": 88704,
    "install4": 88705,
    "overall_notes": 88706,
}

PHOTO_KINDS = [
    "STOREFRONT",
    "PHOTO_1",
    "PHOTO_2",
    "PHOTO_3",
    "PHOTO_4",
    "PHOTO_5",
    "PHOTO_6",
    "PHOTO_7",
    "PHOTO_8",
    "PHOTO_9",
]

DEFAULT_TENANT_ID = "tenant_labatt"
DEFAULT_PROJECT_ID = "project_messi_flying_fish"
EXTRA_SURVEY_ID = "1737162"


@dataclass(frozen=True)
class TransformContext:
    tenant_id: str = DEFAULT_TENANT_ID
    project_id: str = DEFAULT_PROJECT_ID
    client_name: str = "Brasserie Labatt"
    client_slug: str = "brasserie-labatt"
    project_name: str = "Messi and Flying Fish"
    project_slug: str = "messi-flying-fish"
    locale: str = "en-CA"


@dataclass(frozen=True)
class DashboardVisit:
    tenant_id: str
    project_id: str
    survey_id: str
    store_id: str
    store_name: str
    address: str | None
    city: str | None
    visit_date: str
    visit_time: str | None
    clerk_name: str | None
    install1: str | None
    install2: str | None
    install3: str | None
    install4: str | None = None
    overall_notes: str | None = None


@dataclass(frozen=True)
class DashboardPhoto:
    tenant_id: str
    project_id: str
    survey_id: str
    kind: str
    url: str
    caption: str | None = None


@dataclass(frozen=True)
class DashboardMetric:
    tenant_id: str
    project_id: str
    key: str
    label: str
    value: float
    unit: str | None = None
    category: str | None = None


@dataclass(frozen=True)
class TransformedDataset:
    context: TransformContext
    raw_rowsets: dict[str, list[dict[str, Any]]]
    visits: list[DashboardVisit]
    photos: list[DashboardPhoto]
    metrics: list[DashboardMetric] = field(default_factory=list)


def transform_shopmetrics_rowsets(
    rowsets: dict[str, list[dict[str, Any]]],
    context: TransformContext | None = None,
) -> TransformedDataset:
    """Transform raw Shopmetrics rowsets into dashboard objects.

    P1.4: Answer text is passed directly to install columns — no remapping.
    The number of install slots (1–4) is determined by which question IDs
    appear in the form_question_answers rowset.
    """
    ctx = context or TransformContext()
    locations = {
        str(row.get("StoreID")): row
        for row in rowsets.get("locations", [])
        if row.get("StoreID") is not None
    }
    answer_text = build_answer_text_lookup(rowsets.get("form_question_answers", []))
    instance_answers = build_instance_answer_lookup(
        rowsets.get("survey_instance_question_answers", []),
        answer_text,
    )
    question_comments = build_question_comment_lookup(rowsets.get("survey_instance_questions", []))

    # P1.4: Determine which install slots are active from form_question_answers
    active_slots = _detect_active_slots(rowsets.get("form_question_answers", []))

    visits: list[DashboardVisit] = []
    for instance in rowsets.get("survey_instances", []):
        survey_id = str(instance.get("InstanceID"))
        store_id = str(instance.get("Location Store ID") or "")
        location = locations.get(store_id, {})

        # P1.4: Pass answer text directly — no INSTALL*_MAP remapping
        install_values = {}
        for slot_idx in active_slots:
            qid = QUESTION_IDS.get(f"install{slot_idx}")
            if qid:
                install_values[f"install{slot_idx}"] = answer_or_comment(
                    survey_id, qid, instance_answers, question_comments
                )

        visits.append(
            DashboardVisit(
                tenant_id=ctx.tenant_id,
                project_id=ctx.project_id,
                survey_id=survey_id,
                store_id=store_id,
                store_name=nullable_text(location.get("Name")) or "Unknown store",
                address=nullable_text(location.get("Address")),
                city=nullable_text(location.get("City")),
                visit_date=str(instance.get("Date")),
                visit_time=None,
                clerk_name=question_comments.get((survey_id, QUESTION_IDS["clerk"])),
                install1=install_values.get("install1"),
                install2=install_values.get("install2"),
                install3=install_values.get("install3"),
                install4=install_values.get("install4"),
                overall_notes=question_comments.get((survey_id, QUESTION_IDS["overall_notes"])),
            )
        )

    visits = ensure_extra_normalized_visit(visits, ctx)
    photos = build_dashboard_photos(rowsets.get("survey_instance_attachments", []), ctx)

    # P1.4: No hardcoded metrics — targets come from campaign config in DB
    metrics: list[DashboardMetric] = []

    return TransformedDataset(ctx, rowsets, visits, photos, metrics)


def _detect_active_slots(form_question_answers: list[dict[str, Any]]) -> list[int]:
    """Detect which install slots (1–4) are active based on form_question_answers."""
    active = []
    qids_in_form = {int(row.get("QuestionID", 0)) for row in form_question_answers}
    for slot_idx in range(1, 5):
        qid = QUESTION_IDS.get(f"install{slot_idx}")
        if qid and qid in qids_in_form:
            active.append(slot_idx)
    return active if active else [1, 2, 3]


def build_answer_text_lookup(rows: list[dict[str, Any]]) -> dict[tuple[int, int], str]:
    lookup: dict[tuple[int, int], str] = {}
    for row in rows:
        try:
            question_id = int(row.get("QuestionID"))
            position = int(row.get("Position"))
        except (TypeError, ValueError):
            continue
        text = nullable_text(row.get("Text"))
        if text is not None:
            lookup[(question_id, position)] = text
    return lookup


def build_instance_answer_lookup(
    rows: list[dict[str, Any]],
    answer_text: dict[tuple[int, int], str],
) -> dict[tuple[str, int], str]:
    lookup: dict[tuple[str, int], str] = {}
    for row in rows:
        try:
            survey_id = str(row.get("InstanceID"))
            question_id = int(row.get("ProtoQuestionID"))
            answer_pos = int(row.get("AnswerPos"))
        except (TypeError, ValueError):
            continue
        text = answer_text.get((question_id, answer_pos))
        if text is not None:
            lookup[(survey_id, question_id)] = text
    return lookup


def build_question_comment_lookup(rows: list[dict[str, Any]]) -> dict[tuple[str, int], str]:
    lookup: dict[tuple[str, int], str] = {}
    for row in rows:
        try:
            survey_id = str(row.get("InstanceID"))
            question_id = int(row.get("ProtoQuestionID"))
        except (TypeError, ValueError):
            continue
        value = nullable_text(row.get("Question Comment"))
        if value is not None:
            lookup[(survey_id, question_id)] = value
    return lookup


def answer_or_comment(
    survey_id: str,
    question_id: int,
    answers: dict[tuple[str, int], str],
    comments: dict[tuple[str, int], str],
) -> str | None:
    return answers.get((survey_id, question_id)) or comments.get((survey_id, question_id))


def ensure_extra_normalized_visit(
    visits: list[DashboardVisit],
    context: TransformContext,
) -> list[DashboardVisit]:
    # The 1737162 compatibility record is a Labatt-only workbook artifact
    # (CLAUDE.md §5). Do not inject it into other tenants' ingestion output —
    # doing so leaks a phantom visit (null installs) into synthetic tenants.
    if context.tenant_id != DEFAULT_TENANT_ID:
        return visits
    if any(visit.survey_id == EXTRA_SURVEY_ID for visit in visits):
        return visits
    return [
        DashboardVisit(
            tenant_id=context.tenant_id,
            project_id=context.project_id,
            survey_id=EXTRA_SURVEY_ID,
            store_id="EXTRA-1737162",
            store_name="Extra normalized record",
            address=None,
            city=None,
            visit_date="2026-03-06",
            visit_time=None,
            clerk_name=None,
            install1=None,
            install2=None,
            install3=None,
            overall_notes="Compatibility record preserved from the normalized workbook baseline.",
        ),
        *visits,
    ]


def build_dashboard_photos(
    attachment_rows: list[dict[str, Any]],
    context: TransformContext,
) -> list[DashboardPhoto]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in attachment_rows:
        survey_id = str(row.get("InstanceID"))
        grouped.setdefault(survey_id, []).append(row)

    photos: list[DashboardPhoto] = []
    for survey_id, rows in grouped.items():
        sorted_rows = sorted(rows, key=lambda row: safe_int(row.get("AttachmentPosition")))
        for index, row in enumerate(sorted_rows[: len(PHOTO_KINDS)]):
            photos.append(
                DashboardPhoto(
                    tenant_id=context.tenant_id,
                    project_id=context.project_id,
                    survey_id=survey_id,
                    kind=PHOTO_KINDS[index],
                    url=build_attachment_url(row),
                    caption=None,
                )
            )
    return photos


def build_attachment_url(row: dict[str, Any]) -> str:
    attachment_id = row.get("AttachmentID")
    token = row.get("AttachmentAccessToken")
    return (
        "https://premierservice.shopmetrics.com/mystservices/Attachments/getImage.asp"
        f"?AttachmentID={attachment_id}&AccessToken={token}"
    )


def nullable_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def raw_rowsets_json(rowsets: dict[str, list[dict[str, Any]]]) -> str:
    return json.dumps(rowsets, ensure_ascii=False, sort_keys=True)
