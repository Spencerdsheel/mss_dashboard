"""Seed PostgreSQL with N synthetic tenants, each with 1,000+ visits.

P1.4: English install distributions, per-tenant campaign config,
Labatt fixed at 436 visits with its real campaign.

Usage:
    python scripts/seed_multi_tenant_test_data.py
    python scripts/seed_multi_tenant_test_data.py --tenants 5
    python scripts/seed_multi_tenant_test_data.py --db-url "postgresql://..."
    python scripts/seed_multi_tenant_test_data.py --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any

from services.common.campaigns import (
    CAMPAIGN_TEMPLATES as _SHARED_CAMPAIGN_TEMPLATES,
    LABATT_CAMPAIGN as _SHARED_LABATT_CAMPAIGN,
    LABATT_TENANT_ID,
    synthetic_template_index,
)
from services.common.secrets import encrypt_secret
from services.common.security import hash_password
from services.common.settings import load_settings

# ── mulberry32 PRNG ──

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

    def shuffle(self, arr: list) -> list:
        a = arr[:]
        n = len(a)
        for i in range(n - 1, 0, -1):
            j = self.randint(0, i)
            a[i], a[j] = a[j], a[i]
        return a

    def choice(self, seq: list) -> Any:
        return seq[self.randint(0, len(seq) - 1)]


# ── P1.4: Campaign templates (sourced from services.common.campaigns) ──
#
# The shared module uses 2-tuples (text, is_success) for answers.
# The seeder needs 3-tuples (text, is_success, count) for expand_slot_answers.
# Labatt counts come from workbook parity data and are fixed here.
# Synthetic campaign counts are default weights derived from is_success flag.

def _default_count(is_success: bool) -> int:
    """Default visit count weight: success answers weighted higher."""
    return 200 if is_success else 50


def _shared_slot_to_seeder_slot(slot: dict, labatt_counts: list[int] | None = None) -> dict:
    """Convert a shared campaign slot (2-tuple answers) to seeder format (3-tuple answers).

    If labatt_counts is provided, use those exact counts (workbook parity).
    Otherwise, derive counts from is_success using _default_count.
    """
    answers_2t = slot["answers"]
    if labatt_counts is not None:
        answers_3t = [
            (text, is_success, count)
            for (text, is_success), count in zip(answers_2t, labatt_counts)
        ]
    else:
        answers_3t = [
            (text, is_success, _default_count(is_success))
            for text, is_success in answers_2t
        ]
    return {
        "title": slot["title"],
        "question": slot["question"],
        "answers": answers_3t,
    }


# Labatt workbook parity counts per slot (must match INSTALL*_COUNTS in constants.ts)
_LABATT_SLOT_COUNTS = [
    [265, 116, 24, 23, 2, 5, 1],   # Standee Messi
    [266, 56, 52, 38, 12, 7, 5],    # Flying Fish Display
    [216, 52, 85, 39, 32, 7, 5],    # Stock / Supply (order matches shared LABATT_CAMPAIGN)
]

_LABATT_CAMPAIGN = {
    "slots": [
        _shared_slot_to_seeder_slot(slot, counts)
        for slot, counts in zip(_SHARED_LABATT_CAMPAIGN["slots"], _LABATT_SLOT_COUNTS)
    ],
    "target": _SHARED_LABATT_CAMPAIGN["target"],
}

_SYNTHETIC_CAMPAIGNS = [
    {
        "slots": [_shared_slot_to_seeder_slot(slot) for slot in tmpl["slots"]],
        "target": tmpl["target"],
    }
    for tmpl in _SHARED_CAMPAIGN_TEMPLATES
]

TENANT_DEFS: list[tuple[str, str, str, str]] = [
    (LABATT_TENANT_ID, "Brasserie Labatt",      "brasserie-labatt",      "en-CA"),
    ("tenant_test_01", "Test Client Alpha",   "test-client-alpha",   "en-CA"),
    ("tenant_test_02", "Test Client Bravo",   "test-client-bravo",   "en-CA"),
    ("tenant_test_03", "Test Client Charlie", "test-client-charlie", "en-CA"),
    ("tenant_test_04", "Test Client Delta",   "test-client-delta",   "en-CA"),
    ("tenant_test_05", "Test Client Echo",    "test-client-echo",    "en-US"),
    ("tenant_test_06", "Test Client Foxtrot", "test-client-foxtrot", "en-US"),
    ("tenant_test_07", "Test Client Golf",    "test-client-golf",    "en-CA"),
    ("tenant_test_08", "Test Client Hotel",   "test-client-hotel",   "en-US"),
    ("tenant_test_09", "Test Client India",   "test-client-india",   "en-CA"),
    ("tenant_test_10", "Test Client Juliet",  "test-client-juliet",  "en-US"),
]

PHOTO_DIST: dict[str, int] = {
    "STOREFRONT": 417,
    "PHOTO_1":    358,
    "PHOTO_2":    355,
    "PHOTO_3":      0,
    "PHOTO_4":    368,
    "PHOTO_5":    330,
    "PHOTO_6":    195,
    "PHOTO_7":    169,
    "PHOTO_8":     65,
    "PHOTO_9":     37,
}

ROWS_NO_PHOTOS_436 = 3
PHOTO_KINDS = [
    "STOREFRONT", "PHOTO_1", "PHOTO_2", "PHOTO_3",
    "PHOTO_4", "PHOTO_5", "PHOTO_6", "PHOTO_7",
    "PHOTO_8", "PHOTO_9",
]

CITIES: list[tuple[str, str]] = [
    ("Montreal", "QC"), ("Quebec", "QC"), ("Laval", "QC"),
    ("Gatineau", "QC"), ("Longueuil", "QC"), ("Sherbrooke", "QC"),
    ("Trois-Rivieres", "QC"), ("Saguenay", "QC"), ("Levis", "QC"),
    ("Terrebonne", "QC"), ("Saint-Jean-sur-Richelieu", "QC"),
    ("Repentigny", "QC"), ("Brossard", "QC"), ("Drummondville", "QC"),
    ("Saint-Jerome", "QC"), ("Granby", "QC"), ("Blainville", "QC"),
    ("Saint-Hyacinthe", "QC"), ("Shawinigan", "QC"), ("Rimouski", "QC"),
    ("Toronto", "ON"), ("Ottawa", "ON"), ("Mississauga", "ON"),
    ("Hamilton", "ON"), ("London", "ON"), ("Kitchener", "ON"),
    ("Windsor", "ON"), ("Sudbury", "ON"),
]

US_CITIES: list[tuple[str, str]] = [
    ("New York", "NY"), ("Los Angeles", "CA"), ("Chicago", "IL"),
    ("Houston", "TX"), ("Phoenix", "AZ"), ("Philadelphia", "PA"),
    ("San Antonio", "TX"), ("San Diego", "CA"), ("Dallas", "TX"),
    ("San Jose", "CA"),
]

BANNERS = [
    "IGA", "Metro", "Provigo", "Super C", "Maxi",
    "Loblaws", "Sobeys", "Adonis", "Depanneur",
    "Marche Richelieu", "Couche-Tard",
]

STREETS = [
    "Boulevard Saint-Laurent", "Rue Sainte-Catherine",
    "Avenue du Parc", "Boulevard Rene-Levesque",
    "Rue Sherbrooke", "Avenue Laurier", "Rue Notre-Dame",
    "Boulevard Taschereau", "Chemin Queen Mary",
    "Rue Saint-Denis", "King Street", "Queen Street",
    "Yonge Street", "Bank Street",
]

CLERK_FIRST = [
    "Marie", "Jean", "Sophie", "Luc", "Isabelle",
    "Pierre", "Catherine", "Francois", "Nathalie",
    "Eric", "Julie", "Mathieu", "Stephanie",
    "Olivier", "Claire", "Ahmed", "Priya", "Kim", "Raj",
]

CLERK_LAST = [
    "Tremblay", "Gagnon", "Roy", "Cote", "Bouchard",
    "Gauthier", "Morin", "Lavoie", "Fortin", "Gagne",
    "Ouellet", "Pelletier", "Belanger", "Levesque",
    "Bergeron", "Leblanc",
]

NOTES_POOL = [
    None, None, None, None,
    "Manager very cooperative, efficient visit.",
    "Limited space at entrance, installation adjusted.",
    "Standee moved during the day by staff.",
    "Flying Fish clearly visible near registers.",
    "Partial stock-out observed.",
    "Store very busy during visit.",
    "Staff interested in products.",
    "Full installation per planogram.",
    "Additional display request noted.",
]


def expand_slot_answers(answers: list[tuple[str, bool, int]], total: int, rng: PRNG) -> list[str]:
    """Expand a slot's weighted answer distribution to exactly `total` values."""
    scaled: list[str] = []
    for label, _is_success, count in answers:
        n = max(1, round(count * total / 436))
        scaled.extend([label] * n)
    if len(scaled) > total:
        scaled = rng.shuffle(scaled)[:total]
    elif len(scaled) < total:
        scaled.extend([answers[-1][0]] * (total - len(scaled)))
    return rng.shuffle(scaled)


def build_visit_dates(start: str, end: str, total: int, rng: PRNG) -> list[str]:
    from datetime import date, timedelta
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    days: list[date] = []
    d = s
    while d <= e:
        days.append(d)
        d += timedelta(days=1)
    out: list[date] = [s, e]
    remaining = total - 2
    for i in range(remaining):
        out.append(days[i % len(days)])
    out.sort()
    return [d.isoformat() for d in out]


def generate_time(rng: PRNG) -> str:
    h = 9 + rng.randint(0, 9)
    m = rng.randint(0, 59)
    return f"{h:02d}:{m:02d}"


def choose_visit_count(name: str, min_v: int, max_v: int, index: int) -> int:
    rng = PRNG(abs(hash(name)) + index * 777)
    return min_v + rng.randint(0, max_v - min_v)


def get_campaign_for_tenant(tenant_id: str, index: int) -> dict:
    """Return the seeder campaign config (3-tuple answers) for a tenant.

    Template selection uses the shared hash-based ``synthetic_template_index``
    (the SAME function the mock API server uses) so the seeded baseline and the
    mock-served campaign agree for every tenant. ``_SYNTHETIC_CAMPAIGNS`` is
    built in the same order as the shared CAMPAIGN_TEMPLATES, so a shared index
    maps to the matching seeder-format campaign. ``index`` is unused for
    selection (kept for signature compatibility).
    """
    if tenant_id == LABATT_TENANT_ID:
        return _LABATT_CAMPAIGN
    return _SYNTHETIC_CAMPAIGNS[synthetic_template_index(tenant_id)]


@dataclass
class GeneratedVisit:
    survey_id: str
    store_id: str
    store_name: str
    address: str
    city: str
    visit_date: str
    visit_time: str
    clerk_name: str
    install1: str
    install2: str
    install3: str
    install4: str
    overall_notes: str | None


@dataclass
class GeneratedPhoto:
    survey_id: str
    kind: str
    url: str
    caption: str | None


@dataclass
class TenantData:
    tenant_id: str
    name: str
    slug: str
    locale: str
    project_id: str
    project_name: str
    project_slug: str
    visits: list[GeneratedVisit]
    photos: list[GeneratedPhoto]
    client_name: str
    campaign: dict


def generate_tenant_data(
    tenant_id: str,
    name: str,
    slug: str,
    locale: str,
    index: int,
    target_visits: int,
    base_seed: int,
) -> TenantData:
    rng = PRNG(base_seed + index * 1_000_000)
    project_id = f"project_{slug.replace('-', '_')}"
    project_name = f"Project {name}"
    project_slug = f"{slug}-project"

    campaign = get_campaign_for_tenant(tenant_id, index)
    slots = campaign["slots"]
    num_slots = len(slots)

    # Generate install values per slot
    install_vals: list[list[str]] = []
    for slot in slots:
        install_vals.append(expand_slot_answers(slot["answers"], target_visits, rng))

    # Pad to 4 slots if needed
    while len(install_vals) < 4:
        install_vals.append(["Not targeted"] * target_visits)

    photo_targets = {
        kind: max(0, round(count * target_visits / 436))
        for kind, count in PHOTO_DIST.items()
    }
    no_photo_count = max(1, round(ROWS_NO_PHOTOS_436 * target_visits / 436))
    all_indices = list(range(target_visits))
    shuffled_indices = rng.shuffle(all_indices)
    no_photo_indices = set(shuffled_indices[:no_photo_count])
    candidate_indices = [i for i in all_indices if i not in no_photo_indices]

    photo_masks: dict[str, set[int]] = {}
    for kind, want in photo_targets.items():
        if want == 0:
            photo_masks[kind] = set()
        else:
            picked = rng.shuffle(candidate_indices)[:want]
            photo_masks[kind] = set(picked)

    start_date = "2026-03-06"
    end_date = "2026-04-08"
    visit_dates = build_visit_dates(start_date, end_date, target_visits, rng)

    city_pool = US_CITIES if locale == "en-US" else CITIES

    visits: list[GeneratedVisit] = []
    photos: list[GeneratedPhoto] = []
    used_store_ids: set[str] = set()
    next_sid = 1_700_000 + index * 1_000_000

    for i in range(target_visits):
        if tenant_id == LABATT_TENANT_ID and i == 0:
            sid = "1737162"
        else:
            next_sid += 1 + rng.randint(0, 36)
            sid = str(next_sid)

        city_entry = city_pool[rng.randint(0, len(city_pool) - 1)]
        city_name = city_entry[0]
        banner = BANNERS[rng.randint(0, len(BANNERS) - 1)]
        store_id = f"{slug.upper()}-{1000 + i}"
        while store_id in used_store_ids:
            store_id = f"{slug.upper()}-{1000 + i}-{rng.randint(0, 998)}"
        used_store_ids.add(store_id)

        street_num = 100 + rng.randint(0, 9799)
        street = STREETS[rng.randint(0, len(STREETS) - 1)]
        address = f"{street_num} {street}"

        clerk = f"{CLERK_FIRST[rng.randint(0, len(CLERK_FIRST) - 1)]} {CLERK_LAST[rng.randint(0, len(CLERK_LAST) - 1)]}"

        visits.append(GeneratedVisit(
            survey_id=sid,
            store_id=store_id,
            store_name=f"{banner} {city_name} #{store_id[-4:]}",
            address=address,
            city=city_name,
            visit_date=visit_dates[i],
            visit_time=generate_time(rng),
            clerk_name=clerk,
            install1=install_vals[0][i],
            install2=install_vals[1][i] if num_slots > 1 else None,
            install3=install_vals[2][i] if num_slots > 2 else None,
            install4=install_vals[3][i] if num_slots > 3 else None,
            overall_notes=NOTES_POOL[rng.randint(0, len(NOTES_POOL) - 1)],
        ))

        if i in no_photo_indices:
            continue

        for kind in PHOTO_KINDS:
            if i in photo_masks.get(kind, set()):
                url = f"https://picsum.photos/seed/{store_id}-{kind}/800/600"
                photos.append(GeneratedPhoto(
                    survey_id=sid, kind=kind, url=url, caption=None,
                ))

    return TenantData(
        tenant_id=tenant_id,
        name=name,
        slug=slug,
        locale=locale,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        visits=visits,
        photos=photos,
        client_name=name,
        campaign=campaign,
    )


# ── SQL statements ──

SQL_UPSERT_TENANT = """
INSERT INTO dashboard.tenants (tenant_id, name, slug, locale)
VALUES (%s, %s, %s, %s)
ON CONFLICT (tenant_id) DO UPDATE SET
    name = EXCLUDED.name, slug = EXCLUDED.slug, locale = EXCLUDED.locale
"""

SQL_UPSERT_PROJECT = """
INSERT INTO dashboard.projects
    (tenant_id, project_id, name, slug, client_name, provider_kind, start_date, end_date)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (tenant_id, project_id) DO UPDATE SET
    name = EXCLUDED.name, slug = EXCLUDED.slug,
    client_name = EXCLUDED.client_name, provider_kind = EXCLUDED.provider_kind,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
"""

SQL_UPSERT_VISIT = """
INSERT INTO dashboard.visits
    (tenant_id, project_id, survey_id, store_id, store_name,
     address, city, visit_date, visit_time, clerk_name,
     install1, install2, install3, install4, overall_notes, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
ON CONFLICT (tenant_id, project_id, survey_id) DO UPDATE SET
    store_id = EXCLUDED.store_id, store_name = EXCLUDED.store_name,
    address = EXCLUDED.address, city = EXCLUDED.city,
    visit_date = EXCLUDED.visit_date, visit_time = EXCLUDED.visit_time,
    clerk_name = EXCLUDED.clerk_name,
    install1 = EXCLUDED.install1, install2 = EXCLUDED.install2,
    install3 = EXCLUDED.install3, install4 = EXCLUDED.install4,
    overall_notes = EXCLUDED.overall_notes, updated_at = now()
"""

SQL_UPSERT_PHOTO = """
INSERT INTO dashboard.visit_photos
    (tenant_id, project_id, survey_id, kind, url, caption, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, now())
ON CONFLICT (tenant_id, project_id, survey_id, kind, url) DO UPDATE SET
    caption = EXCLUDED.caption, updated_at = now()
"""

SQL_UPSERT_SLOT = """
INSERT INTO dashboard.project_install_slots
    (tenant_id, project_id, slot_index, title, question, target, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, now())
ON CONFLICT (tenant_id, project_id, slot_index) DO UPDATE SET
    title = EXCLUDED.title, question = EXCLUDED.question,
    target = EXCLUDED.target, updated_at = now()
"""

SQL_UPSERT_CATEGORY = """
INSERT INTO dashboard.project_install_categories
    (tenant_id, project_id, slot_index, position, label, is_success)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (tenant_id, project_id, slot_index, position) DO UPDATE SET
    label = EXCLUDED.label, is_success = EXCLUDED.is_success
"""

SQL_UPSERT_PROVIDER_CONNECTION = """
INSERT INTO dashboard.provider_connections
    (tenant_id, kind, status, base_url, client_id, client_secret_encrypted, config, updated_at)
VALUES (%s, 'client', 'active', %s, %s, %s, %s::jsonb, now())
ON CONFLICT (tenant_id, kind) DO UPDATE SET
    kind = 'client', status = 'active', base_url = EXCLUDED.base_url,
    client_id = EXCLUDED.client_id,
    client_secret_encrypted = EXCLUDED.client_secret_encrypted,
    config = EXCLUDED.config, updated_at = now()
"""

SQL_UPSERT_PHOTO_LABEL = """
INSERT INTO dashboard.photo_slot_labels
    (tenant_id, project_id, kind, label, updated_at)
VALUES (%s, %s, %s, %s, now())
ON CONFLICT (tenant_id, project_id, kind) DO NOTHING
"""

SQL_UPSERT_USER = """
INSERT INTO dashboard.users
    (user_id, tenant_id, email, name, role, project_ids, hashed_password, status, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', now())
ON CONFLICT (user_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email,
    name = EXCLUDED.name, role = EXCLUDED.role,
    project_ids = EXCLUDED.project_ids, hashed_password = EXCLUDED.hashed_password,
    updated_at = now()
"""

PHOTO_LABELS = [
    ("STOREFRONT", "Storefront"), ("PHOTO_1", "Photo 1"),
    ("PHOTO_2", "Photo 2"), ("PHOTO_3", "Photo 3"),
    ("PHOTO_4", "Photo 4"), ("PHOTO_5", "Photo 5"),
    ("PHOTO_6", "Photo 6"), ("PHOTO_7", "Photo 7"),
    ("PHOTO_8", "Photo 8"), ("PHOTO_9", "Photo 9"),
]


def seed_tenant(cursor, data: TenantData, index: int, settings, dry_run: bool = False) -> dict:
    if not dry_run:
        cursor.execute(SQL_UPSERT_TENANT, (data.tenant_id, data.name, data.slug, data.locale))

    visit_dates = sorted(v.visit_date for v in data.visits)
    if not dry_run:
        cursor.execute(SQL_UPSERT_PROJECT, (
            data.tenant_id, data.project_id, data.project_name, data.project_slug,
            data.client_name, "client", visit_dates[0], visit_dates[-1],
        ))

    for v in data.visits:
        if not dry_run:
            cursor.execute(SQL_UPSERT_VISIT, (
                data.tenant_id, data.project_id,
                v.survey_id, v.store_id, v.store_name,
                v.address, v.city, v.visit_date, v.visit_time,
                v.clerk_name, v.install1, v.install2, v.install3, v.install4,
                v.overall_notes,
            ))

    for p in data.photos:
        if not dry_run:
            cursor.execute(SQL_UPSERT_PHOTO, (
                data.tenant_id, data.project_id, p.survey_id, p.kind, p.url, p.caption,
            ))

    # P1.4: Seed campaign config
    campaign = data.campaign
    for idx, slot in enumerate(campaign["slots"], 1):
        if not dry_run:
            cursor.execute(SQL_UPSERT_SLOT, (
                data.tenant_id, data.project_id, idx,
                slot["title"], slot["question"], campaign.get("target"),
            ))
        for pos, (label, is_success, _count) in enumerate(slot["answers"], 1):
            if not dry_run:
                cursor.execute(SQL_UPSERT_CATEGORY, (
                    data.tenant_id, data.project_id, idx, pos, label, is_success,
                ))

    # Provider connection with encrypted secret
    client_id = int(hashlib.md5(data.tenant_id.encode()).hexdigest()[:8], 16) % 9000 + 1000
    form_id = int(hashlib.md5(f"{data.tenant_id}_form".encode()).hexdigest()[:8], 16) % 9000 + 1000
    client_secret = f"client_secret_{data.tenant_id}"
    # S1: provider secrets are encrypted with SECRET_ENCRYPTION_KEY (not the JWT
    # secret) so ingestion can decrypt them with the same key.
    encrypted_secret = encrypt_secret(client_secret, settings.secret_encryption_key)
    config = json.dumps({"form_id": form_id})

    if not dry_run:
        cursor.execute(SQL_UPSERT_PROVIDER_CONNECTION, (
            data.tenant_id, "http://localhost:8020", str(client_id),
            encrypted_secret, config,
        ))

    for kind, label in PHOTO_LABELS:
        if not dry_run:
            cursor.execute(SQL_UPSERT_PHOTO_LABEL, (data.tenant_id, data.project_id, kind, label))

    DEFAULT_TEST_PASSWORD = "Demo123!"
    users = [
        (f"client_test_{index + 1}", data.tenant_id,
         f"client-test{index + 1}@demo.local", f"Test Client {index + 1}",
         "CLIENT", [data.project_id], hash_password(DEFAULT_TEST_PASSWORD)),
    ]
    for user_id, tenant_id, email, name, role, project_ids, hashed_pw in users:
        if not dry_run:
            cursor.execute(SQL_UPSERT_USER, (user_id, tenant_id, email, name, role, project_ids, hashed_pw))

    slot_count = len(campaign["slots"])
    return {
        "name": data.name,
        "visits": len(data.visits),
        "photos": len(data.photos),
        "project_id": data.project_id,
        "slots": slot_count,
        "campaign": campaign["slots"][0]["title"] if slot_count > 0 else "N/A",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed PostgreSQL with synthetic multi-tenant test data (P1.4)")
    parser.add_argument("--tenants", type=int, default=10, help="Number of tenants (default: 10)")
    parser.add_argument("--db-url", type=str, default=None, help="PostgreSQL URL")
    parser.add_argument("--seed", type=int, default=20260306, help="Base PRNG seed")
    parser.add_argument("--min-visits", type=int, default=1000, help="Min visits per tenant")
    parser.add_argument("--max-visits", type=int, default=1200, help="Max visits per tenant")
    parser.add_argument("--dry-run", action="store_true", help="Print counts without inserting")
    args = parser.parse_args()

    settings = load_settings()
    db_url = args.db_url or os.getenv("DATABASE_URL") or settings.database_url

    n_tenants = min(args.tenants, len(TENANT_DEFS))
    tenant_defs = TENANT_DEFS[:n_tenants]

    # Labatt always gets 436 visits
    target_counts = []
    for idx, (tid, name, _, _) in enumerate(tenant_defs):
        if tid == LABATT_TENANT_ID:
            target_counts.append(436)
        else:
            target_counts.append(choose_visit_count(name, args.min_visits, args.max_visits, idx))

    tenant_data_list: list[TenantData] = []
    for idx, (tid, name, slug, locale) in enumerate(tenant_defs):
        data = generate_tenant_data(tid, name, slug, locale, idx, target_counts[idx], args.seed)
        tenant_data_list.append(data)

    total_visits = sum(len(d.visits) for d in tenant_data_list)
    total_photos = sum(len(d.photos) for d in tenant_data_list)
    print(f"Will seed {n_tenants} tenants with {total_visits:,} visits and {total_photos:,} photos")

    if args.dry_run:
        for data in tenant_data_list:
            print(f"  {data.name:30s} | {len(data.visits):5d} visits | {len(data.photos):5d} photos | {len(data.campaign['slots'])} slots | {data.campaign['slots'][0]['title']}")
        print("DRY-RUN -- no data was inserted")
        return

    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("psycopg is required. Install with: pip install -r requirements-backend.txt") from exc

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cursor:
            schema_path = os.path.join(os.path.dirname(__file__), "..", "services", "ingestion", "dashboard_schema.sql")
            with open(schema_path, encoding="utf-8") as f:
                cursor.execute(f.read())

            results = []
            for idx, data in enumerate(tenant_data_list):
                r = seed_tenant(cursor, data, idx, settings)
                results.append(r)

        conn.commit()

    print(f"\nSeeded {n_tenants} tenants successfully:")
    for r in results:
        print(f"  {r['name']:30s} | {r['visits']:5d} visits | {r['photos']:5d} photos | {r['slots']} slots | {r['campaign']}")
    print(f"\nTotal: {total_visits:,} visits | {total_photos:,} photos")

    # Create admin + demo login users
    admin_password = "Demo123!"
    admin_hash = hash_password(admin_password)
    if not args.dry_run:
        labatt_project_id = f"project_{TENANT_DEFS[0][2].replace('-', '_')}"
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cursor:
                # Default company (also created by migration 001) so demo users can carry a
                # valid company_id FK even on a fresh, migrations-not-yet-applied seed.
                cursor.execute(
                    """
                    INSERT INTO dashboard.companies (company_id, name, slug)
                    VALUES ('company_default', 'Default Company', 'default')
                    ON CONFLICT (company_id) DO NOTHING
                    """
                )
                cursor.execute(SQL_UPSERT_USER, (
                    "user_admin", None, "admin@demo.local", "Demo Admin",
                    "ADMIN", [], admin_hash,
                ))
                # Demo accounts mirrored from the in-memory fixture
                # (services/common/repository.py seed_phase01_repository). Both live on Labatt,
                # which is always seeded.
                cursor.execute(SQL_UPSERT_USER, (
                    "user_client", LABATT_TENANT_ID, "client@demo.local", "Demo Client",
                    "TENANT_USER", [labatt_project_id], admin_hash,
                ))
                cursor.execute(SQL_UPSERT_USER, (
                    "user_client_admin", None, "clientadmin@demo.local", "Client Admin",
                    "CLIENT_ADMIN", [], admin_hash,
                ))
                # SQL_UPSERT_USER does not set company_id / tenant_ids; set the scoping the
                # demo accounts need (a NULL-tenant CLIENT_ADMIN is not covered by migration 001).
                cursor.execute(
                    """
                    UPDATE dashboard.users
                    SET company_id = 'company_default', tenant_ids = %s
                    WHERE user_id IN ('user_client', 'user_client_admin')
                    """,
                    ([LABATT_TENANT_ID],),
                )
            conn.commit()
        print(f"\nAdmin user created: admin@demo.local / {admin_password}")
        print(f"Demo users created: client@demo.local, clientadmin@demo.local / {admin_password}")


if __name__ == "__main__":
    main()
