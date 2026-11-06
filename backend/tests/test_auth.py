import logging
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import auth, config
from app.db import connect, init_db
from app.main import create_app

EMAIL = "ada@acme.example"
PASSWORD = "correct horse battery"


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def client(db_path, tmp_path):
    with TestClient(create_app(db_path, tmp_path / "absent")) as client:
        yield client


def signup(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/auth/signup", json={"email": email, "password": password})


def login(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def rows(db_path, query):
    with closing(sqlite3.connect(db_path)) as conn:
        return conn.execute(query).fetchall()


def test_password_hash_round_trip():
    stored = auth.hash_password(PASSWORD)
    assert PASSWORD not in stored
    assert auth.verify_password(PASSWORD, stored)
    assert not auth.verify_password("wrong password", stored)


def test_the_same_password_hashes_differently():
    assert auth.hash_password(PASSWORD) != auth.hash_password(PASSWORD)


def test_signup_signs_you_in(client):
    response = signup(client)
    assert response.status_code == 201
    assert response.json() == {"email": EMAIL}
    assert client.get("/api/auth/me").json() == {"email": EMAIL}


def test_signup_stores_neither_the_password_nor_the_raw_token(client, db_path):
    signup(client)
    [(stored,)] = rows(db_path, "SELECT password_hash FROM users")
    assert PASSWORD not in stored

    [(token_hash,)] = rows(db_path, "SELECT token_hash FROM sessions")
    assert client.cookies[auth.COOKIE_NAME] != token_hash


def test_email_is_normalized(client):
    assert signup(client, email="  Ada@Acme.Example ").json() == {"email": EMAIL}
    client.post("/api/auth/logout")
    assert login(client, email="ADA@acme.example").status_code == 200


def test_duplicate_email_is_rejected(client, db_path):
    signup(client)
    client.cookies.clear()
    assert signup(client, email=EMAIL.upper()).status_code == 409
    assert len(rows(db_path, "SELECT id FROM users")) == 1


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": EMAIL, "password": "short"},
        {"email": EMAIL, "password": "x" * 1025},
        {"email": "x" * 250 + "@a.example", "password": PASSWORD},
    ],
)
def test_invalid_signup_is_rejected(client, credentials):
    assert client.post("/api/auth/signup", json=credentials).status_code == 422


def test_login_and_logout(client):
    signup(client)
    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401

    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"email": EMAIL}
    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_logout_invalidates_the_session_on_the_server(client):
    signup(client)
    token = client.cookies[auth.COOKIE_NAME]
    client.post("/api/auth/logout")

    client.cookies.set(auth.COOKIE_NAME, token)
    assert client.get("/api/auth/me").status_code == 401


def test_logout_without_a_session_succeeds(client):
    assert client.post("/api/auth/logout").status_code == 204


def test_wrong_password_and_unknown_email_look_the_same(client):
    signup(client)
    client.cookies.clear()
    wrong = login(client, password="wrong password here")
    unknown = login(client, email="nobody@acme.example")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_unknown_email_still_verifies_a_password_to_hide_timing(client, monkeypatch):
    calls = []
    original = auth.verify_password
    monkeypatch.setattr(
        auth, "verify_password", lambda *args: calls.append(args) or original(*args)
    )
    login(client, email="nobody@acme.example")
    assert len(calls) == 1


def test_expired_sessions_are_rejected(client, db_path):
    signup(client)
    with closing(sqlite3.connect(db_path)) as conn, conn:
        conn.execute("UPDATE sessions SET expires_at = ?", (int(time.time()) - 1,))
    assert client.get("/api/auth/me").status_code == 401


def test_each_user_gets_their_own_session(db_path, tmp_path):
    app = create_app(db_path, tmp_path / "absent")
    with TestClient(app) as first, TestClient(app) as second:
        signup(first)
        signup(second, email="sam@globex.example")
        assert first.get("/api/auth/me").json() == {"email": EMAIL}
        assert second.get("/api/auth/me").json() == {"email": "sam@globex.example"}


def test_a_restart_removes_accounts_and_sessions(db_path, tmp_path):
    app = create_app(db_path, tmp_path / "absent")
    with TestClient(app) as client:
        signup(client)
        token = client.cookies[auth.COOKIE_NAME]
    with TestClient(app) as client:
        client.cookies.set(auth.COOKIE_NAME, token)
        assert client.get("/api/auth/me").status_code == 401
        assert login(client).status_code == 401


def test_cookie_is_http_only_and_lax(client):
    header = signup(client).headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "max-age=" in header
    assert "secure" not in header


def test_cookie_is_secure_when_configured(client, monkeypatch):
    monkeypatch.setattr(config, "COOKIE_SECURE", True)
    assert "secure" in signup(client).headers["set-cookie"].lower()


def test_login_is_limited_after_repeated_failures(client):
    signup(client)
    client.cookies.clear()
    for _ in range(auth.LOGIN_ATTEMPTS):
        assert login(client, password="wrong password here").status_code == 401

    blocked = login(client)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_a_successful_login_resets_the_failure_count(client):
    signup(client)
    client.cookies.clear()
    for _ in range(auth.LOGIN_ATTEMPTS - 1):
        login(client, password="wrong password here")
    assert login(client).status_code == 200

    client.cookies.clear()
    assert login(client, password="wrong password here").status_code == 401


def test_signup_is_limited_per_client(client):
    for number in range(auth.SIGNUP_ATTEMPTS):
        assert signup(client, email=f"user{number}@acme.example").status_code == 201
    assert signup(client, email="another@acme.example").status_code == 429


def test_passwords_are_not_logged(client, caplog):
    with caplog.at_level(logging.DEBUG):
        signup(client)
        login(client, password="SECRET-PASSWORD-VALUE")
    assert PASSWORD not in caplog.text
    assert "SECRET-PASSWORD-VALUE" not in caplog.text


def test_cors_lets_the_dev_frontend_send_credentials(client):
    response = client.options(
        "/api/auth/me",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_login_is_limited_per_client_across_different_emails(client):
    for number in range(auth.LOGIN_CLIENT_ATTEMPTS):
        assert login(client, email=f"user{number}@acme.example").status_code == 401
    assert login(client, email="another@acme.example").status_code == 429


def test_connections_can_move_between_worker_threads(db_path):
    init_db(db_path)
    with closing(connect(db_path)) as db, ThreadPoolExecutor(max_workers=1) as pool:
        count = pool.submit(lambda: db.execute("SELECT COUNT(*) FROM users").fetchone()[0])
        assert count.result() == 0


class TestRateLimiter:
    def make(self, limit=2, window=60):
        self.now = 1000.0
        return auth.RateLimiter(limit, window, clock=lambda: self.now)

    def test_blocks_after_the_limit_and_allows_again_later(self):
        limiter = self.make()
        limiter.consume("a")
        limiter.consume("a")
        with pytest.raises(HTTPException) as blocked:
            limiter.consume("a")
        assert blocked.value.headers["Retry-After"] == "60"
        self.now += 61
        limiter.consume("a")

    def test_clear_resets_a_key(self):
        limiter = self.make()
        limiter.consume("a")
        limiter.consume("a")
        limiter.clear("a")
        limiter.consume("a")

    def test_forgets_expired_keys_it_never_sees_again(self):
        limiter = self.make()
        for number in range(100):
            limiter.consume(f"random{number}@acme.example")
        self.now += 61
        limiter.consume("b")
        assert list(limiter.hits) == ["b"]

    def test_counts_exactly_the_limit_across_threads(self):
        limiter = auth.RateLimiter(50, 60)
        allowed = []

        def attempt(_):
            try:
                limiter.consume("a")
                allowed.append(True)
            except HTTPException:
                pass

        with ThreadPoolExecutor(max_workers=20) as pool:
            list(pool.map(attempt, range(500)))

        assert len(allowed) == 50
