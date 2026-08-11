"""Tracked runner for the repository's forward-only SQL migrations."""

from __future__ import annotations

import argparse
from pathlib import Path

from services.common.settings import load_settings

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"), key=lambda path: path.name)


def _tracking_table_exists(conn) -> bool:
    with conn.cursor() as cursor:
        cursor.execute("SELECT to_regclass('dashboard.schema_migrations')")
        row = cursor.fetchone()
    return bool(row and row[0])


def pending_migration_filenames(conn) -> list[str]:
    """Return migration filenames that have not yet been recorded.

    A database without the bootstrap table has no recorded migrations, so all
    discovered files are pending. This keeps ``--dry-run`` read-only.
    """
    filenames = [path.name for path in _migration_files()]
    if not _tracking_table_exists(conn):
        return filenames

    with conn.cursor() as cursor:
        cursor.execute("SELECT filename FROM dashboard.schema_migrations")
        applied = {row[0] for row in cursor.fetchall()}
    return [filename for filename in filenames if filename not in applied]


def apply_pending_migrations(conn) -> list[str]:
    """Apply unrecorded migrations once, in filename order.

    Each migration body and its tracking-row insert share one transaction. A
    failure therefore leaves that filename unrecorded and aborts process
    startup rather than allowing the application to serve a partial schema.
    """
    files_by_name = {path.name: path for path in _migration_files()}
    applied: list[str] = []

    pending_filenames = pending_migration_filenames(conn)
    # The lookup above starts a read transaction with psycopg. Close it before
    # entering the per-file transaction blocks so each migration is committed
    # (or rolled back) independently rather than becoming a savepoint in one
    # outer transaction.
    commit = getattr(conn, "commit", None)
    if commit is not None:
        commit()

    for filename in pending_filenames:
        path = files_by_name[filename]
        with conn.transaction():
            with conn.cursor() as cursor:
                cursor.execute(path.read_text(encoding="utf-8"))
                cursor.execute(
                    """
                    INSERT INTO dashboard.schema_migrations (filename)
                    VALUES (%s)
                    """,
                    (filename,),
                )
        applied.append(filename)

    return applied


def run_migrations(database_url: str, *, dry_run: bool = False) -> list[str]:
    """Connect using the ingestion DDL pattern and either list or apply work."""
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "psycopg is required to run dashboard migrations. "
            "Install backend dependencies with `pip install -r requirements-backend.txt`."
        ) from exc

    with psycopg.connect(database_url) as conn:
        if dry_run:
            return pending_migration_filenames(conn)
        return apply_pending_migrations(conn)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply pending dashboard SQL migrations.")
    parser.add_argument("--dry-run", action="store_true", help="List pending migrations without writing.")
    args = parser.parse_args()

    filenames = run_migrations(load_settings().database_url, dry_run=args.dry_run)
    if filenames:
        print("\n".join(filenames))
    else:
        print("No pending migrations.")


if __name__ == "__main__":
    main()
