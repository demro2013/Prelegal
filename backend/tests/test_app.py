import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def static_dir(tmp_path):
    directory = tmp_path / "static"
    directory.mkdir()
    (directory / "index.html").write_text("<h1>Prelegal</h1>")
    (directory / "404.html").write_text("<h1>Not found</h1>")
    return directory


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def client(db_path, static_dir):
    with TestClient(create_app(db_path, static_dir)) as client:
        yield client


def test_health_reports_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_startup_creates_the_database(client, db_path):
    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_restart_clears_existing_users(db_path, static_dir):
    app = create_app(db_path, static_dir)
    with TestClient(app):
        with closing(sqlite3.connect(db_path)) as conn, conn:
            conn.execute(
                "INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x')"
            )

    with TestClient(app):
        with closing(sqlite3.connect(db_path)) as conn:
            assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_serves_frontend_at_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "<h1>Prelegal</h1>" in response.text


def test_unknown_paths_return_404(client):
    assert client.get("/missing").status_code == 404
    assert client.get("/api/missing").status_code == 404


def test_api_works_without_a_frontend_build(db_path, tmp_path):
    with TestClient(create_app(db_path, tmp_path / "absent")) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404
