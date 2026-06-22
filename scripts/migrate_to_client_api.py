"""Migrate all tenants to use the Client API Server.

Updates provider_connections and projects to use kind='client' instead of
'fake_shopmetrics'. Sets base_url to http://localhost:8020 and generates
tenant-specific numeric credentials and form IDs.

Usage:
    python scripts/migrate_to_client_api.py
    python scripts/migrate_to_client_api.py --db-url "postgresql://..."
    python scripts/migrate_to_client_api.py --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os

from services.common.secrets import encrypt_secret
from services.common.settings import load_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate tenants to Client API")
    parser.add_argument("--db-url", type=str, default=None, help="PostgreSQL connection string")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without applying")
    parser.add_argument("--base-url", type=str, default="http://localhost:8020", help="Client API base URL")
    args = parser.parse_args()

    import psycopg
    from psycopg.rows import dict_row

    db_url = args.db_url or os.getenv("DATABASE_URL") or load_settings().database_url
    settings = load_settings()
    jwt_secret = settings.jwt_secret

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            # Delete old fake_shopmetrics rows first
            if not args.dry_run:
                cursor.execute("DELETE FROM dashboard.provider_connections WHERE kind = 'fake_shopmetrics'")
                deleted = cursor.rowcount
                print(f"Deleted {deleted} old 'fake_shopmetrics' provider connection(s).\n")

            # Get all tenants
            cursor.execute("SELECT tenant_id, name, slug FROM dashboard.tenants ORDER BY tenant_id ASC")
            tenants = list(cursor.fetchall())

            if not tenants:
                print("No tenants found in database.")
                return

            print(f"Found {len(tenants)} tenant(s) to migrate.\n")

            for tenant in tenants:
                tid = tenant["tenant_id"]
                # Generate deterministic numeric IDs from tenant name
                client_id = int(hashlib.md5(tid.encode()).hexdigest()[:8], 16) % 9000 + 1000
                form_id = int(hashlib.md5(f"{tid}_form".encode()).hexdigest()[:8], 16) % 9000 + 1000
                client_secret = f"client_secret_{tid}"
                encrypted_secret = encrypt_secret(client_secret, jwt_secret)
                config = json.dumps({"form_id": form_id})

                if args.dry_run:
                    print(f"[DRY RUN] Would update tenant {tid}:")
                    print(f"  kind = 'client'")
                    print(f"  base_url = '{args.base_url}'")
                    print(f"  client_id = {client_id}")
                    print(f"  form_id = {form_id}")
                    print(f"  status = 'active'")
                    print()
                    continue

                # Upsert provider connection with config
                cursor.execute(
                    """
                    INSERT INTO dashboard.provider_connections
                        (tenant_id, kind, status, base_url, client_id, client_secret_encrypted, config, updated_at)
                    VALUES (%s, 'client', 'active', %s, %s, %s, %s::jsonb, now())
                    ON CONFLICT (tenant_id, kind) DO UPDATE SET
                        kind = 'client',
                        status = 'active',
                        base_url = EXCLUDED.base_url,
                        client_id = EXCLUDED.client_id,
                        client_secret_encrypted = EXCLUDED.client_secret_encrypted,
                        config = EXCLUDED.config,
                        updated_at = now()
                    """,
                    (tid, args.base_url, str(client_id), encrypted_secret, config),
                )

                # Update project provider_kind
                cursor.execute(
                    """
                    UPDATE dashboard.projects
                    SET provider_kind = 'client'
                    WHERE tenant_id = %s
                    """,
                    (tid,),
                )

                print(f"Migrated tenant {tid}:")
                print(f"  client_id = {client_id}")
                print(f"  form_id = {form_id}")
                print(f"  base_url = '{args.base_url}'")
                print(f"  status = 'active'")
                print()

            if not args.dry_run:
                conn.commit()
                print("Migration complete. All tenants now use kind='client' with unique form IDs.")
            else:
                print("Dry run complete. No changes were applied.")


if __name__ == "__main__":
    main()
