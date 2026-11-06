import sqlite3
from contextlib import closing

import pytest

from app.db import init_db


def test_creates_users_table_with_expected_columns(tmp_path):
    path = tmp_path / "test.db"
    init_db(path)

    with closing(sqlite3.connect(path)) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}

    assert columns == {"id", "email", "password_hash", "created_at"}


def test_creates_missing_parent_directory(tmp_path):
    path = tmp_path / "nested" / "test.db"
    init_db(path)
    assert path.exists()


def test_recreates_database_from_scratch(tmp_path):
    path = tmp_path / "test.db"
    init_db(path)
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute(
            "INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x')"
        )

    init_db(path)

    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_email_must_be_unique(tmp_path):
    path = tmp_path / "test.db"
    init_db(path)
    insert = "INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x')"

    with closing(sqlite3.connect(path)) as conn:
        conn.execute(insert)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(insert)
