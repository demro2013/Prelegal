import re
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import AfterValidator, BaseModel, Field

from app import auth
from app.auth import Limits, User, current_user, get_db, get_limits

router = APIRouter(prefix="/auth")

Database = Annotated[sqlite3.Connection, Depends(get_db)]
RateLimits = Annotated[Limits, Depends(get_limits)]


def _normalize_email(email: str) -> str:
    email = email.strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("Enter a valid email address.")
    return email


Email = Annotated[str, AfterValidator(_normalize_email)]


class Signup(BaseModel):
    email: Email
    # The upper limit keeps a huge password from tying up the hash function.
    password: str = Field(min_length=10, max_length=1024)


class Login(BaseModel):
    email: Email
    password: str = Field(max_length=1024)


class Account(BaseModel):
    email: str


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# Plain defs, so FastAPI runs the slow password hashing in a worker thread.
@router.post("/signup", status_code=201)
def signup(
    body: Signup, request: Request, response: Response, db: Database, limits: RateLimits
) -> Account:
    limits.signup.consume(_client_key(request))

    password_hash = auth.hash_password(body.password)
    try:
        with db:
            cursor = db.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (body.email, password_hash),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists.") from None

    auth.start_session(db, response, cursor.lastrowid)
    return Account(email=body.email)


@router.post("/login")
def login(
    body: Login, request: Request, response: Response, db: Database, limits: RateLimits
) -> Account:
    # Per email against guessing one password, and per client against trying many emails.
    limits.login_client.consume(_client_key(request))
    limits.login.consume(body.email)

    row = db.execute(
        "SELECT id, password_hash FROM users WHERE email = ?", (body.email,)
    ).fetchone()
    stored = row[1] if row else auth.DUMMY_PASSWORD_HASH
    # Always checked, so an unknown email takes as long as a wrong password.
    is_correct = auth.verify_password(body.password, stored)

    if not row or not is_correct:
        raise HTTPException(401, "That email and password don't match.")

    limits.login.clear(body.email)
    auth.start_session(db, response, row[0])
    return Account(email=body.email)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Database) -> None:
    auth.end_session(db, request, response)


@router.get("/me")
def me(user: Annotated[User, Depends(current_user)]) -> Account:
    return Account(email=user.email)
