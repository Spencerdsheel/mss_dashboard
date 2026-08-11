"""Tests for the tracked, idempotent SQL migration runner."""

from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from services.common.settings import load_settings
from services.ingestion import migrate


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self._rows: list[tuple[str | None]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def execute(self, query: str, params=None) -> None:
        normalized = query.strip()
        if normalized.startswith("SELECT to_regclass"):
            self._rows = [("dashboard.schema_migrations" if self.connection.table_exists else None,)]
        elif normalized.startswith("SELECT filename FROM dashboard.schema_migrations"):
            self._rows = [(filename,) for filename in sorted(self.connection.recorded)]
        elif normalized.startswith("INSERT INTO dashboard.schema_migrations"):
            self.connection.recorded.add(params[0])
            self.connection.write_count += 1
        else:
            self.connection.sql_bodies.append(query)
            if "CREATE TABLE IF NOT EXISTS dashboard.schema_migrations" in query:
                self.connection.table_exists = True
                self.connection.write_count += 1

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class FakeConnection:
    def __init__(self, *, table_exists: bool = False) -> None:
        self.table_exists = table_exists
        self.recorded: set[str] = set()
        self.sql_bodies: list[str] = []
        self.write_count = 0
        self.transaction_count = 0

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    @contextmanager
    def transaction(self):
        self.transaction_count += 1
        yield


def _write_migrations(tmp_path) -> None:
    (tmp_path / "000_schema_migrations.sql").write_text(
        "CREATE TABLE IF NOT EXISTS dashboard.schema_migrations (filename TEXT PRIMARY KEY);",
        encoding="utf-8",
    )
    (tmp_path / "001_non_idempotent_fixture.sql").write_text(
        "CREATE TABLE only_once (id INTEGER PRIMARY KEY);",
        encoding="utf-8",
    )


def test_apply_then_noop_and_non_idempotent_fixture_runs_once(tmp_path, monkeypatch):
    _write_migrations(tmp_path)
    monkeypatch.setattr(migrate, "MIGRATIONS_DIR", tmp_path)
    connection = FakeConnection()

    assert migrate.apply_pending_migrations(connection) == [
        "000_schema_migrations.sql",
        "001_non_idempotent_fixture.sql",
    ]
    assert connection.recorded == {
        "000_schema_migrations.sql",
        "001_non_idempotent_fixture.sql",
    }
    assert connection.transaction_count == 2
    assert sum("CREATE TABLE only_once" in body for body in connection.sql_bodies) == 1

    assert migrate.apply_pending_migrations(connection) == []
    assert connection.transaction_count == 2
    assert sum("CREATE TABLE only_once" in body for body in connection.sql_bodies) == 1


def test_dry_run_lists_pending_without_writing(tmp_path, monkeypatch):
    _write_migrations(tmp_path)
    monkeypatch.setattr(migrate, "MIGRATIONS_DIR", tmp_path)
    connection = FakeConnection(table_exists=True)
    connection.recorded.add("000_schema_migrations.sql")

    before_records = set(connection.recorded)
    before_writes = connection.write_count
    assert migrate.pending_migration_filenames(connection) == ["001_non_idempotent_fixture.sql"]
    assert connection.recorded == before_records
    assert connection.write_count == before_writes


@pytest.fixture
def temporary_migration_database():
    """Provide an isolated PostgreSQL database, or skip when it is unavailable."""
    import psycopg

    database_name = f"migration_runner_{uuid4().hex}"
    maintenance_url = make_conninfo(load_settings().database_url, dbname="postgres")
    database_url = make_conninfo(load_settings().database_url, dbname=database_name)

    try:
        with psycopg.connect(maintenance_url, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
    except psycopg.Error as exc:
        pytest.skip(f"PostgreSQL integration database unavailable: {exc.__class__.__name__}")

    try:
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("CREATE SCHEMA dashboard")
            connection.commit()
        yield database_url
    finally:
        try:
            with psycopg.connect(maintenance_url, autocommit=True) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                            sql.Identifier(database_name)
                        )
                    )
        except psycopg.Error:
            # Test cleanup must not hide the original integration-test result.
            pass


def test_real_postgres_applies_once_records_and_dry_runs_without_writes(
    tmp_path, monkeypatch, temporary_migration_database
):
    """Exercise real PostgreSQL DDL and per-file transactions in a fresh DB."""
    import psycopg
    from psycopg.pq import TransactionStatus

    _write_migrations(tmp_path)
    monkeypatch.setattr(migrate, "MIGRATIONS_DIR", tmp_path)

    with psycopg.connect(temporary_migration_database) as connection:
        # A fresh DB has no tracking table; dry-run lists all work and writes nothing.
        assert migrate.pending_migration_filenames(connection) == [
            "000_schema_migrations.sql",
            "001_non_idempotent_fixture.sql",
        ]
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass('dashboard.schema_migrations')")
            assert cursor.fetchone()[0] is None

        assert migrate.apply_pending_migrations(connection) == [
            "000_schema_migrations.sql",
            "001_non_idempotent_fixture.sql",
        ]
        assert connection.info.transaction_status == TransactionStatus.IDLE
        with connection.cursor() as cursor:
            cursor.execute("SELECT filename FROM dashboard.schema_migrations ORDER BY filename")
            assert [row[0] for row in cursor.fetchall()] == [
                "000_schema_migrations.sql",
                "001_non_idempotent_fixture.sql",
            ]
            cursor.execute("SELECT to_regclass('public.only_once')")
            assert cursor.fetchone()[0] == "only_once"

        # The fixture SQL is deliberately non-idempotent, so a second execution
        # would fail. The recorded filename must make the second run a no-op.
        assert migrate.apply_pending_migrations(connection) == []


def test_page_key_migration_backfills_overview_and_allows_locations(temporary_migration_database):
    """006 preserves the historical overview row while widening the key."""
    import psycopg

    migration = migrate.MIGRATIONS_DIR / "006_dashboard_layout_page_key.sql"
    with psycopg.connect(temporary_migration_database) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE dashboard.dashboard_layouts (
                    tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
                    layout_json JSONB NOT NULL, source TEXT NOT NULL DEFAULT 'manual',
                    updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (tenant_id, project_id)
                )
                """
            )
            cursor.execute(
                "INSERT INTO dashboard.dashboard_layouts (tenant_id, project_id, layout_json) VALUES ('t', 'p', '{\"version\": 1}')"
            )
            cursor.execute(migration.read_text(encoding="utf-8"))
            cursor.execute("SELECT page_key, layout_json->>'version' FROM dashboard.dashboard_layouts")
            assert cursor.fetchone() == ("overview", "1")
            cursor.execute(
                "INSERT INTO dashboard.dashboard_layouts (tenant_id, project_id, page_key, layout_json) VALUES ('t', 'p', 'locations', '{\"version\": 2}')"
            )
            cursor.execute("SELECT page_key FROM dashboard.dashboard_layouts WHERE tenant_id = 't' AND project_id = 'p' ORDER BY page_key")
            assert [row[0] for row in cursor.fetchall()] == ["locations", "overview"]
        connection.commit()
