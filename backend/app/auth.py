import base64
import hashlib
import hmac
import secrets
import sqlite3
import threading
import time
from collections import deque
from collections.abc import Callable, Iterator
from contextlib import closing
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, Response

from app import config
from app.db import connect

COOKIE_NAME = "prelegal_session"
SESSION_SECONDS = 7 * 24 * 60 * 60

LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_CLIENT_ATTEMPTS = 30
SIGNUP_ATTEMPTS = 10
SIGNUP_WINDOW_SECONDS = 60 * 60
CHAT_MESSAGES = 20
CHAT_WINDOW_SECONDS = 60

# Follows OWASP's guidance for scrypt. Stored with each hash so it can change later.
_SCRYPT_N = 2**15
_SCRYPT_R = 8
_SCRYPT_P = 3
# Each hash uses about 32 MB, so a burst of logins can't be allowed to run all at once.
_MAX_CONCURRENT_HASHES = 4
_hash_slots = threading.BoundedSemaphore(_MAX_CONCURRENT_HASHES)


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    with _hash_slots:
        return hashlib.scrypt(
            password.encode(), salt=salt, n=n, r=r, p=p, maxmem=128 * n * r * 2, dklen=32
        )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = _scrypt(password, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P)
    encoded = [base64.b64encode(part).decode() for part in (salt, derived)]
    return "$".join(["scrypt", str(_SCRYPT_N), str(_SCRYPT_R), str(_SCRYPT_P), *encoded])


def verify_password(password: str, stored: str) -> bool:
    _, n, r, p, salt, expected = stored.split("$")
    derived = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
    return hmac.compare_digest(derived, base64.b64decode(expected))


# Checked for unknown emails, so a login takes as long whether the account exists or not.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: sqlite3.Connection, response: Response, user_id: int) -> None:
    """Stores only the token's hash, so a leaked database can't be used to log in."""
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with db:
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_hash_token(token), user_id, now + SESSION_SECONDS),
        )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=config.COOKIE_SECURE,
    )


def end_session(db: sqlite3.Connection, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
    response.delete_cookie(COOKIE_NAME)


class RateLimiter:
    """Counts recent attempts per key. In memory, so it's per process and resets on restart."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window
        self.clock = clock
        self.hits: dict[str, deque[float]] = {}
        self.lock = threading.Lock()
        self.last_sweep = clock()

    def _sweep(self, now: float) -> None:
        """Forgets expired keys, so attempts with random emails can't grow memory forever."""
        if now - self.last_sweep < self.window:
            return
        self.last_sweep = now
        self.hits = {
            key: hits for key, hits in self.hits.items() if hits[-1] > now - self.window
        }

    def consume(self, key: str) -> None:
        """Records an attempt, or raises a 429 at the limit, as one locked step.

        Simultaneous attempts therefore can't all pass before any is counted.
        """
        now = self.clock()
        with self.lock:
            self._sweep(now)
            hits = self.hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry_after = max(1, int(hits[0] + self.window - now))
                raise HTTPException(
                    429,
                    "Too many attempts. Try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def clear(self, key: str) -> None:
        with self.lock:
            self.hits.pop(key, None)


@dataclass
class Limits:
    login: RateLimiter
    login_client: RateLimiter
    signup: RateLimiter
    chat: RateLimiter


def create_limits() -> Limits:
    return Limits(
        login=RateLimiter(LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS),
        login_client=RateLimiter(LOGIN_CLIENT_ATTEMPTS, LOGIN_WINDOW_SECONDS),
        signup=RateLimiter(SIGNUP_ATTEMPTS, SIGNUP_WINDOW_SECONDS),
        chat=RateLimiter(CHAT_MESSAGES, CHAT_WINDOW_SECONDS),
    )


def get_limits(request: Request) -> Limits:
    return request.app.state.limits


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    # One connection per request, because sqlite3 connections stay on their own thread.
    with closing(connect(request.app.state.db_path)) as db:
        yield db


@dataclass
class User:
    id: int
    email: str


def current_user(request: Request, db: sqlite3.Connection = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    row = token and db.execute(
        """
        SELECT users.id, users.email FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        """,
        (_hash_token(token), int(time.time())),
    ).fetchone()
    if not row:
        raise HTTPException(401, "Log in to continue.")
    return User(id=row[0], email=row[1])
