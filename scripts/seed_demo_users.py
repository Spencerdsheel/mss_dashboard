"""Seed the demo login accounts into PostgreSQL.

The multi-tenant seed (``seed_multi_tenant_test_data.py``) only creates
``admin@demo.local`` and ``client-test1..10@demo.local``. The demo accounts that the
in-memory fixture (``services/common/repository.py`` ``seed_phase01_repository``) exposes —
``client@demo.local`` (TENANT_USER) and ``clientadmin@demo.local`` (CLIENT_ADMIN) — were never
inserted into Postgres, so logging in as them returns 401 ("Invalid email or password").

This script upserts those accounts (idempotent) without wiping/re-seeding the whole database.
Each account is only inserted if its tenant(s) already exist, so it is safe to run against a
partially-seeded database.

Usage (inside conda env ``venv``):
    conda activate venv
    python scripts/seed_demo_users.py
    python scripts/seed_demo_users.py --db-url "postgresql://..."
    python scripts/seed_demo_users.py --password "Demo123!"
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field

# Allow running directly (`python scripts/seed_demo_users.py`) by putting the repo root on the
# path, matching scripts/create_admin_user.py — there is no installed `services` package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.common.security import hash_password  # noqa: E402
from services.common.settings import load_settings  # noqa: E402

DEFAULT_COMPANY_ID = "company_default"
DEFAULT_PASSWORD = "Demo123!"


@dataclass(frozen=True)
class DemoUser:
    user_id: str
    email: str
    name: str
    role: str
    tenant_id: str | None
    project_ids: list[str] = field(default_factory=list)
    tenant_ids: list[str] = field(default_factory=list)


# Mirrors seed_phase01_repository() but uses the *Postgres* project ids, which the
# multi-tenant seed derives from the tenant slug: project_<slug_with_underscores>.
#   Brasserie Labatt  -> tenant_labatt      / project_brasserie_labatt
#   Test Client Alpha -> tenant_test_01     / project_test_client_alpha
DEMO_USERS: list[DemoUser] = [
    DemoUser(
        user_id="user_client",
        email="client@demo.local",
        name="Demo Client",
        role="TENANT_USER",
        tenant_id="tenant_labatt",
        project_ids=["project_brasserie_labatt"],
        tenant_ids=["tenant_labatt"],
    ),
    DemoUser(
        user_id="user_client_admin",
        email="clientadmin@demo.local",
        name="Client Admin",
        role="CLIENT_ADMIN",
        tenant_id=None,
        project_ids=[],
        tenant_ids=["tenant_labatt"],
    ),
    DemoUser(
        # The fixture's "other" tenant (tenant_other) is not part of the Postgres seed, so
        # map this second TENANT_USER onto an existing test tenant for isolation testing.
        user_id="user_other",
        email="other@demo.local",
        name="Other Client",
        role="TENANT_USER",
        tenant_id="tenant_test_01",
        project_ids=["project_test_client_alpha"],
        tenant_ids=["tenant_test_01"],
    ),
]


SQL_UPSERT_COMPANY = """
INSERT INTO dashboard.companies (company_id, name, slug)
VALUES (%s, %s, %s)
ON CONFLICT (company_id) DO NOTHING
"""

SQL_UPSERT_DEMO_USER = """
INSERT INTO dashboard.users
    (user_id, tenant_id, company_id, email, name, role,
     project_ids, tenant_ids, status, hashed_password, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, now())
ON CONFLICT (email) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    project_ids = EXCLUDED.project_ids,
    tenant_ids = EXCLUDED.tenant_ids,
    status = 'active',
    hashed_password = EXCLUDED.hashed_password,
    updated_at = now()
"""


def _tenant_exists(cursor, tenant_id: str) -> bool:
    cursor.execute("SELECT 1 FROM dashboard.tenants WHERE tenant_id = %s", (tenant_id,))
    return cursor.fetchone() is not None


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo login accounts into PostgreSQL")
    parser.add_argument("--db-url", type=str, default=None, help="PostgreSQL URL")
    parser.add_argument("--password", type=str, default=DEFAULT_PASSWORD, help="Password for all demo accounts")
    args = parser.parse_args()

    settings = load_settings()
    db_url = args.db_url or os.getenv("DATABASE_URL") or settings.database_url
    hashed_pw = hash_password(args.password)

    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError("psycopg is required. Install with: pip install -r requirements-backend.txt") from exc

    seeded: list[str] = []
    skipped: list[str] = []

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(SQL_UPSERT_COMPANY, (DEFAULT_COMPANY_ID, "Default Company", "default"))

            for user in DEMO_USERS:
                required_tenants = list(user.tenant_ids)
                if user.tenant_id:
                    required_tenants.append(user.tenant_id)
                missing = [t for t in dict.fromkeys(required_tenants) if not _tenant_exists(cursor, t)]
                if missing:
                    skipped.append(f"{user.email} (missing tenant(s): {', '.join(missing)})")
                    continue
                cursor.execute(
                    SQL_UPSERT_DEMO_USER,
                    (
                        user.user_id,
                        user.tenant_id,
                        DEFAULT_COMPANY_ID,
                        user.email,
                        user.name,
                        user.role,
                        user.project_ids,
                        user.tenant_ids,
                        hashed_pw,
                    ),
                )
                seeded.append(f"{user.email} ({user.role})")
        conn.commit()

    print(f"Seeded {len(seeded)} demo account(s) with password: {args.password}")
    for line in seeded:
        print(f"  + {line}")
    for line in skipped:
        print(f"  - skipped {line}")


if __name__ == "__main__":
    main()
