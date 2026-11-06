import sqlite3
from contextlib import closing
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def init_db(path: Path) -> None:
    """Create the database from scratch, discarding any existing data."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute(SCHEMA)
