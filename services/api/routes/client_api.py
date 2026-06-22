"""Client API Server — mimics the Shopmetrics API contract.

Provides two endpoints:
  POST /oauth/connect/token  — validates credentials against DB
  POST /api/v2/execute       — generates tenant-specific rowsets with gradual mutations

P1.4: Each tenant gets a distinct per-project campaign (variable 1–4 install
slots, English categories, varied success distributions). Labatt is fixed at
exactly 436 visits with NO synthetic mutations.

WARNING — DEVELOPMENT / SINGLE-PROCESS MOCK ONLY
=================================================
This module is intentionally a lightweight stand-in for the real Shopmetrics
API. It has the following production-unsafe characteristics that are accepted
for dev use and must NOT be used in production:

* Token store (ACCESS_TOKENS) lives in process memory. Tokens are lost on
  restart and are not shared across multiple workers/processes.
* Tenant state (TENANT_STATES) is also in-process only.
* DB connections are opened per-request via psycopg.connect().  For the
  expected low call rate in dev this is fine; a real server would use a pool.
* The token map is bounded by S9_MAX_TOKENS (default 1 000) with periodic
  eviction of expired entries to prevent unbounded memory growth.

Do not enable this router in a multi-worker production deployment.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Form, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from services.common.campaigns import (
    CAMPAIGN_TEMPLATES as _CAMPAIGN_TEMPLATES,
    LABATT_CAMPAIGN as _LABATT_CAMPAIGN,
    LABATT_TENANT_ID,
    get_campaign_by_tenant_hash as _get_campaign_by_hash,
)
from services.common.secrets import decrypt_secret
from services.common.settings import load_settings

router = APIRouter()

# ── Constants ──────────────────────────────────────────────────────────────

GENERATION_INTERVAL_SECONDS = int(os.getenv("CLIENT_API_GENERATION_SECONDS", "300"))
ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("CLIENT_API_TOKEN_TTL_SECONDS", "1800"))
S9_MAX_TOKENS = int(os.getenv("CLIENT_API_MAX_TOKENS", "1000"))

CLIENT_ID = 1001

PHOTO_KINDS = [
    "STOREFRONT", "PHOTO_1", "PHOTO_2", "PHOTO_3", "PHOTO_4",
    "PHOTO_5", "PHOTO_6", "PHOTO_7", "PHOTO_8", "PHOTO_9",
]

# P1.4: Labatt project ID (tenant ID imported from services.common.campaigns)
LABATT_PROJECT_ID = "project_messi_flying_fish"

# _CAMPAIGN_TEMPLATES and _LABATT_CAMPAIGN are imported from services.common.campaigns

# ── PRNG (mulberry32) ─────────────────────────────────────────────────────


class PRNG:
    def __init__(self, seed: int) -> None:
        self._a = seed & 0xFFFFFFFF

    def next(self) -> float:
        self._a = (self._a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self._a
        t = (t ^ (t >> 15)) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) & 0xFFFFFFFF) * 61) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    def randint(self, lo: int, hi: int) -> int:
        return lo + int(self.next() * (hi - lo + 1))

    def choice(self, seq: list) -> Any:
        return seq[self.randint(0, len(seq) - 1)]

    def shuffle(self, arr: list) -> list:
        a = arr[:]
        n = len(a)
        for i in range(n - 1, 0, -1):
            j = self.randint(0, i)
            a[i], a[j] = a[j], a[i]
        return a


# ── Tenant state ───────────────────────────────────────────────────────────


@dataclass
class TenantBaseline:
    tenant_id: str
    project_id: str
    client_name: str
    project_name: str
    form_id: int
    stores: list[dict[str, Any]]
    visits: list[dict[str, Any]]
    photos: list[dict[str, Any]]
    campaign: dict  # P1.4: campaign config for this tenant


@dataclass
class GenerationState:
    baseline: TenantBaseline
    generation: int = 0
    last_updated: float = field(default_factory=time.monotonic)


@dataclass(frozen=True)
class AccessToken:
    tenant_id: str
    expires_at: float


TENANT_STATES: dict[str, GenerationState] = {}
ACCESS_TOKENS: dict[str, AccessToken] = {}


# ── DB helpers ─────────────────────────────────────────────────────────────


def _get_db_url() -> str:
    return load_settings().database_url


def _fetch_all(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    import psycopg
    from psycopg.rows import dict_row
    with psycopg.connect(_get_db_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return list(cur.fetchall())


def _fetch_one(query: str, params: tuple = ()) -> dict[str, Any] | None:
    rows = _fetch_all(query, params)
    return rows[0] if rows else None


# ── Campaign helpers ───────────────────────────────────────────────────────


def _get_campaign_for_tenant(tenant_id: str, rng: PRNG) -> dict:
    """Return the campaign config for a tenant.

    Labatt gets its fixed 3-slot campaign (from shared module).
    Synthetic tenants get a template selected by MD5 hash (from shared module),
    with per-tenant success distribution weights added here.
    """
    template = _get_campaign_by_hash(tenant_id)

    if tenant_id == LABATT_TENANT_ID:
        return template

    # Vary success distribution weights per tenant using the RNG
    weights = []
    for slot in template["slots"]:
        slot_weights = []
        for _, is_success in slot["answers"]:
            if is_success:
                slot_weights.append(rng.randint(30, 60))
            else:
                slot_weights.append(rng.randint(5, 20))
        weights.append(slot_weights)

    return {
        "slots": template["slots"],
        "target": template["target"],
        "weights": weights,
    }


def _build_question_id_map(slots: list[dict]) -> dict[str, int]:
    """Map slot keys to question IDs."""
    return {
        "clerk": 88701,
        "install1": 88702,
        "install2": 88703,
        "install3": 88704,
        "install4": 88705,
        "overall_notes": 88706,
    }


# ── Initialization ─────────────────────────────────────────────────────────


def init_tenant_states() -> None:
    """Load baseline data from DB for all active client tenants."""
    TENANT_STATES.clear()
    ACCESS_TOKENS.clear()
    tenants = _fetch_all(
        """
        SELECT t.tenant_id, t.name, t.slug,
               p.project_id, p.name AS project_name,
               pc.config
        FROM dashboard.tenants t
        JOIN dashboard.projects p ON p.tenant_id = t.tenant_id
        JOIN dashboard.provider_connections pc ON pc.tenant_id = t.tenant_id
        WHERE pc.kind = 'client' AND pc.status = 'active'
        ORDER BY t.tenant_id ASC
        """
    )

    for tenant in tenants:
        tid = tenant["tenant_id"]
        pid = tenant["project_id"]
        config = tenant.get("config") or {}
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except (json.JSONDecodeError, TypeError):
                config = {}
        form_id = int(config.get("form_id", 2001))

        stores = _fetch_all(
            """
            SELECT DISTINCT store_id, store_name, address, city
            FROM dashboard.visits
            WHERE tenant_id = %s AND project_id = %s
            ORDER BY store_id ASC
            """,
            (tid, pid),
        )

        visits = _fetch_all(
            """
            SELECT survey_id, store_id, visit_date,
                   install1, install2, install3, install4,
                   clerk_name, overall_notes
            FROM dashboard.visits
            WHERE tenant_id = %s AND project_id = %s
            ORDER BY survey_id ASC
            """,
            (tid, pid),
        )

        photos = _fetch_all(
            """
            SELECT survey_id, kind, url
            FROM dashboard.visit_photos
            WHERE tenant_id = %s AND project_id = %s
            ORDER BY survey_id ASC, kind ASC
            """,
            (tid, pid),
        )

        seed = int(hashlib.md5(tid.encode()).hexdigest()[:8], 16)
        rng = PRNG(seed)
        campaign = _get_campaign_for_tenant(tid, rng)

        baseline = TenantBaseline(
            tenant_id=tid,
            project_id=pid,
            client_name=tenant["name"],
            project_name=tenant["project_name"],
            form_id=form_id,
            stores=stores,
            visits=visits,
            photos=photos,
            campaign=campaign,
        )

        TENANT_STATES[tid] = GenerationState(baseline=baseline)


def _get_generation_state(token: str) -> GenerationState:
    """Look up tenant state from access token, advancing generation if needed."""
    access_token = ACCESS_TOKENS.get(token)
    if not access_token:
        raise HTTPException(status_code=401, detail="invalid_token")
    if access_token.expires_at <= time.monotonic():
        ACCESS_TOKENS.pop(token, None)
        raise HTTPException(status_code=401, detail="invalid_token")

    state = TENANT_STATES.get(access_token.tenant_id)
    if not state:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    now = time.monotonic()
    elapsed = now - state.last_updated
    generations_to_advance = int(elapsed / GENERATION_INTERVAL_SECONDS)

    if generations_to_advance > 0:
        state.generation += generations_to_advance
        state.last_updated += generations_to_advance * GENERATION_INTERVAL_SECONDS

    return state


# ── Data generation ────────────────────────────────────────────────────────


def _make_rng(tenant_id: str, generation: int) -> PRNG:
    seed = int(hashlib.md5(tenant_id.encode()).hexdigest()[:8], 16)
    return PRNG(seed + generation * 1000)


def _generate_clients(state: GenerationState, rng: PRNG) -> list[dict]:
    return [{"ID": CLIENT_ID, "Name": state.baseline.client_name}]


def _generate_forms(state: GenerationState, rng: PRNG) -> list[dict]:
    return [{"ClientID": CLIENT_ID, "FormID": state.baseline.form_id, "Title": state.baseline.project_name}]


def _generate_locations(state: GenerationState, rng: PRNG) -> list[dict]:
    locations = []
    for store in state.baseline.stores:
        locations.append({
            "ClientID": CLIENT_ID,
            "StoreID": str(store["store_id"]),
            "Name": store["store_name"],
            "Address": store.get("address"),
            "Address2": None,
            "City": store.get("city"),
            "Country": "CA",
            "StateRegion": "QC",
            "PostalCode": f"H{rng.randint(1, 9)}A {rng.randint(1, 9)}{rng.randint(0, 9)}{rng.randint(0, 9)}",
        })
    return locations


def _generate_client_properties(state: GenerationState, rng: PRNG) -> list[dict]:
    return [
        {"ClientID": CLIENT_ID, "ID": 1, "Name": "State/Region"},
        {"ClientID": CLIENT_ID, "ID": 2, "Name": "Postal Code"},
    ]


def _generate_location_property_values(state: GenerationState, rng: PRNG) -> list[dict]:
    records = []
    seen = set()
    for store in state.baseline.stores:
        sid = str(store["store_id"])
        if sid not in seen:
            seen.add(sid)
            records.append({
                "ClientID": CLIENT_ID,
                "StoreID": sid,
                "PropertyID": 1,
                "PropertyValue": "QC",
            })
            records.append({
                "ClientID": CLIENT_ID,
                "StoreID": sid,
                "PropertyID": 2,
                "PropertyValue": f"H{rng.randint(1, 9)}A {rng.randint(1, 9)}{rng.randint(0, 9)}{rng.randint(0, 9)}",
            })
    return records


def _generate_form_elements(state: GenerationState, rng: PRNG) -> list[dict]:
    fid = state.baseline.form_id
    campaign = state.baseline.campaign
    slots = campaign["slots"]
    qid_map = _build_question_id_map(slots)

    elements = [
        {"FormID": fid, "ElementID": qid_map["clerk"], "ElementTypeID": "Q", "Text": "Please enter the name of the staff member you spoke to", "Position": 1, "SectionLevel1ParentElementID": None, "SectionLevel2ParentElementID": None, "SectionLevel3ParentElementID": None},
    ]

    for idx, slot in enumerate(slots, 1):
        elements.append({
            "FormID": fid,
            "ElementID": qid_map[f"install{idx}"],
            "ElementTypeID": "Q",
            "Text": slot["question"],
            "Title": slot["title"],
            "Target": campaign.get("target"),
            "Position": idx + 1,
            "SectionLevel1ParentElementID": None,
            "SectionLevel2ParentElementID": None,
            "SectionLevel3ParentElementID": None,
        })

    elements.append({
        "FormID": fid, "ElementID": qid_map["overall_notes"], "ElementTypeID": "Q", "Text": "Overall comment", "Position": len(slots) + 2,
        "SectionLevel1ParentElementID": None, "SectionLevel2ParentElementID": None, "SectionLevel3ParentElementID": None,
    })

    return elements


def _generate_form_question_answers(state: GenerationState, rng: PRNG) -> list[dict]:
    fid = state.baseline.form_id
    campaign = state.baseline.campaign
    slots = campaign["slots"]
    qid_map = _build_question_id_map(slots)
    records = []

    for idx, slot in enumerate(slots, 1):
        qid = qid_map[f"install{idx}"]
        for pos, (text, is_success) in enumerate(slot["answers"], 1):
            records.append({
                "FormID": fid,
                "QuestionID": qid,
                "AnswerSetID": qid,
                "Position": pos,
                "Text": text,
                "IsSuccess": bool(is_success),
                "Measure": None,
            })

    return records


def _pick_answer_for_slot(slot: dict, weights: list[int] | None, rng: PRNG) -> str:
    """Pick an answer for a slot using weighted random selection."""
    answers = slot["answers"]
    if weights and len(weights) == len(answers):
        total = sum(weights)
        r = rng.next() * total
        cumulative = 0
        for i, w in enumerate(weights):
            cumulative += w
            if r <= cumulative:
                return answers[i][0]
    return rng.choice([a[0] for a in answers])


def _generate_survey_instances(state: GenerationState, rng: PRNG) -> list[dict]:
    base_visits = state.baseline.visits
    gen = state.generation
    campaign = state.baseline.campaign
    slots = campaign["slots"]
    weights = campaign.get("weights")

    # P1.4: Labatt is FIXED — no synthetic mutations, return baseline as-is
    if state.baseline.tenant_id == LABATT_TENANT_ID:
        instances = []
        for visit in base_visits:
            instances.append({
                "InstanceID": str(visit["survey_id"]),
                "ProtoSurveyID": state.baseline.form_id,
                "Date": str(visit["visit_date"]),
                "Location Store ID": str(visit["store_id"]),
                "Campaign": state.baseline.project_name,
                "_answers": {
                    f"install{idx+1}": visit.get(f"install{idx+1}") or _pick_answer_for_slot(slots[idx], weights[idx] if weights else None, rng)
                    for idx in range(len(slots))
                },
                "_clerk": visit.get("clerk_name"),
                "_notes": visit.get("overall_notes"),
            })
        return instances

    # Synthetic tenants: gradual mutation (85% keep, 10% change, 5% new)
    instances = []
    visit_count = len(base_visits)
    new_count = max(1, int(visit_count * 0.05))
    change_count = max(1, int(visit_count * 0.10))

    indices = list(range(visit_count))
    shuffled = rng.shuffle(indices)
    change_indices = set(shuffled[:change_count])
    new_survey_base = 9000000 + gen * 1000

    for i, visit in enumerate(base_visits):
        answers = {}
        for idx, slot in enumerate(slots):
            existing = visit.get(f"install{idx+1}")
            if i in change_indices and rng.next() < 0.10:
                answers[f"install{idx+1}"] = _pick_answer_for_slot(slot, weights[idx] if weights else None, rng)
            else:
                answers[f"install{idx+1}"] = existing or _pick_answer_for_slot(slot, weights[idx] if weights else None, rng)

        instances.append({
            "InstanceID": str(visit["survey_id"]),
            "ProtoSurveyID": state.baseline.form_id,
            "Date": str(visit["visit_date"]),
            "Location Store ID": str(visit["store_id"]),
            "Campaign": state.baseline.project_name,
            "_answers": answers,
            "_clerk": visit.get("clerk_name"),
            "_notes": visit.get("overall_notes"),
        })

    # Add new visits
    stores = state.baseline.stores
    for j in range(new_count):
        store = rng.choice(stores) if stores else {"store_id": "NEW-001", "store_name": "New Store"}
        answers = {}
        for idx, slot in enumerate(slots):
            answers[f"install{idx+1}"] = _pick_answer_for_slot(slot, weights[idx] if weights else None, rng)

        instances.append({
            "InstanceID": str(new_survey_base + j),
            "ProtoSurveyID": state.baseline.form_id,
            "Date": "2026-03-15",
            "Location Store ID": str(store["store_id"]),
            "Campaign": state.baseline.project_name,
            "_answers": answers,
            "_clerk": None,
            "_notes": None,
        })

    return instances


def _generate_survey_instance_questions(state: GenerationState, rng: PRNG) -> list[dict]:
    instances = _generate_survey_instances(state, rng)
    qid_map = _build_question_id_map(state.baseline.campaign["slots"])
    records = []
    for inst in instances:
        sid = inst["InstanceID"]
        clerk = inst.get("_clerk")
        notes = inst.get("_notes")
        if clerk:
            records.append({"InstanceID": sid, "ProtoQuestionID": qid_map["clerk"], "Question Comment": clerk, "Pts": None, "Pts Of": None})
        if notes:
            records.append({"InstanceID": sid, "ProtoQuestionID": qid_map["overall_notes"], "Question Comment": notes, "Pts": None, "Pts Of": None})
    return records


def _generate_survey_instance_question_answers(state: GenerationState, rng: PRNG) -> list[dict]:
    instances = _generate_survey_instances(state, rng)
    campaign = state.baseline.campaign
    slots = campaign["slots"]
    qid_map = _build_question_id_map(slots)
    records = []

    for inst in instances:
        sid = inst["InstanceID"]
        answers = inst.get("_answers", {})
        for idx, slot in enumerate(slots):
            qid = qid_map[f"install{idx+1}"]
            value = answers.get(f"install{idx+1}")
            if value:
                # Find position of this answer text
                for pos, (text, _) in enumerate(slot["answers"], 1):
                    if text == value:
                        records.append({
                            "InstanceID": sid,
                            "ProtoQuestionID": qid,
                            "AnswerPos": pos,
                        })
                        break
    return records


def _generate_survey_instance_location_properties(state: GenerationState, rng: PRNG) -> list[dict]:
    instances = _generate_survey_instances(state, rng)
    records = []
    for inst in instances:
        records.append({
            "InstanceID": inst["InstanceID"],
            "CustomPropertyID": 1,
            "CustomPropertyValue": "QC",
        })
        records.append({
            "InstanceID": inst["InstanceID"],
            "CustomPropertyID": 2,
            "CustomPropertyValue": f"H{rng.randint(1, 9)}A {rng.randint(1, 9)}{rng.randint(0, 9)}{rng.randint(0, 9)}",
        })
    return records


def _generate_survey_instance_attachments(state: GenerationState, rng: PRNG) -> list[dict]:
    instances = _generate_survey_instances(state, rng)
    records = []
    for inst in instances:
        sid = inst["InstanceID"]
        photo_count = rng.randint(3, 7)
        for pos in range(photo_count):
            kind_idx = pos % len(PHOTO_KINDS)
            attachment_id = f"{sid}-{kind_idx}-{rng.randint(1000, 9999)}"
            records.append({
                "InstanceID": sid,
                "AttachmentID": attachment_id,
                "AttachmentPosition": pos + 1,
                "AttachmentQuestionID": 88707 + kind_idx,
                "AttachmentAccessToken": f"tok-{sid[:8]}-{rng.randint(1000, 9999)}",
            })
    return records


# ── Resource routing ───────────────────────────────────────────────────────


RESOURCE_GENERATORS = {
    "clients": _generate_clients,
    "forms": _generate_forms,
    "locations": _generate_locations,
    "client_properties": _generate_client_properties,
    "location_property_values": _generate_location_property_values,
    "form_elements": _generate_form_elements,
    "form_question_answers": _generate_form_question_answers,
    "survey_instances": _generate_survey_instances,
    "survey_instance_questions": _generate_survey_instance_questions,
    "survey_instance_question_answers": _generate_survey_instance_question_answers,
    "survey_instance_location_properties": _generate_survey_instance_location_properties,
    "survey_instance_attachments": _generate_survey_instance_attachments,
}


def _resolve_resource_name(post_json: dict) -> str:
    """Parse the execute payload to determine which resource is requested."""
    dataset_name = post_json.get("dataset", {}).get("datasetname", "")
    params = {p.get("name"): p.get("value", "") for p in post_json.get("parameters", [])}
    query_spec = params.get("QuerySpecification", "")

    if dataset_name.endswith("/Clients"):
        return "clients"
    if dataset_name.endswith("/Forms") and params.get("QuerySpecification"):
        return "forms"
    if dataset_name.endswith("/ClientProperties"):
        return "client_properties"
    if dataset_name.endswith("/Locations") and params.get("IsIncludeCustomProperties") == "1":
        return "location_property_values"
    if dataset_name.endswith("/Locations"):
        return "locations"
    if dataset_name.endswith("/FormElements") and params.get("IsIncludeFormQuestionAnswers") == "1":
        return "form_question_answers"
    if dataset_name.endswith("/FormElements"):
        return "form_elements"
    if "AttachmentID" in query_spec:
        return "survey_instance_attachments"
    if "CustomPropertyID" in query_spec:
        return "survey_instance_location_properties"
    if "AnswerPos" in query_spec:
        return "survey_instance_question_answers"
    if "Question Comment" in query_spec:
        return "survey_instance_questions"
    if "ProtoSurveyID" in query_spec:
        return "survey_instances"

    raise HTTPException(status_code=400, detail=f"Unknown resource: {dataset_name} {query_spec}")


def _generate_resource(resource_name: str, state: GenerationState, rng: PRNG) -> list[dict]:
    generator = RESOURCE_GENERATORS.get(resource_name)
    if not generator:
        raise HTTPException(status_code=400, detail=f"Unknown resource: {resource_name}")
    return generator(state, rng)


def _make_response(rows: list[dict]) -> dict:
    return {"dataset": {"data": [rows]}}


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/oauth/connect/token")
async def oauth_token(
    client_id: str = Form(...),
    client_secret: str = Form(...),
    grant_type: str = Form(...),
):
    """Authenticate and return an access token."""
    if grant_type != "client_credentials":
        return JSONResponse(
            status_code=400,
            content={"error": "unsupported_grant_type"},
        )

    conn = _fetch_one(
        """
        SELECT tenant_id, client_secret_encrypted
        FROM dashboard.provider_connections
        WHERE kind = 'client' AND status = 'active' AND client_id = %s
        """,
        (client_id,),
    )

    if not conn:
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_client", "error_description": "Client not found"},
        )

    try:
        settings = load_settings()
        decrypted = decrypt_secret(conn["client_secret_encrypted"], settings.secret_encryption_key)
    except Exception:
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_client", "error_description": "Invalid credentials"},
        )

    if not hmac.compare_digest(decrypted, client_secret):
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_client", "error_description": "Invalid credentials"},
        )

    tenant_id = conn["tenant_id"]
    now = time.monotonic()

    expired_tokens = [
        existing_token
        for existing_token, access_token in ACCESS_TOKENS.items()
        if access_token.expires_at <= now
    ]
    for expired_token in expired_tokens:
        ACCESS_TOKENS.pop(expired_token, None)

    while len(ACCESS_TOKENS) >= S9_MAX_TOKENS:
        oldest = next(iter(ACCESS_TOKENS))
        ACCESS_TOKENS.pop(oldest, None)

    token = secrets.token_urlsafe(32)
    ACCESS_TOKENS[token] = AccessToken(
        tenant_id=tenant_id,
        expires_at=now + ACCESS_TOKEN_TTL_SECONDS,
    )

    return {
        "access_token": token,
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "token_type": "Bearer",
    }


@router.post("/api/v2/execute")
async def execute_query(
    request: Request,
    post: str = Form(...),
    authorization: str | None = Header(default=None),
):
    """Execute a query and return rowsets for the requested resource."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_token")

    token = authorization.split(" ", 1)[1].strip()
    state = _get_generation_state(token)
    rng = _make_rng(state.baseline.tenant_id, state.generation)

    try:
        post_json = json.loads(post)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid_post_json")

    resource_name = _resolve_resource_name(post_json)
    rows = _generate_resource(resource_name, state, rng)

    return _make_response(rows)
