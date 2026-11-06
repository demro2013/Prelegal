from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.db import init_db
from app.routes import chat, health


def create_app(db_path: Path = config.DB_PATH, static_dir: Path = config.STATIC_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(db_path)
        yield

    app = FastAPI(title="Prelegal", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")

    # Mounted last because a mount at "/" matches every path not routed above.
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()
