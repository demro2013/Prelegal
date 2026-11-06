from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import config
from app.db import init_db
from app.routes import health


def create_app(db_path: Path = config.DB_PATH, static_dir: Path = config.STATIC_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(db_path)
        yield

    app = FastAPI(title="Prelegal", lifespan=lifespan)
    app.include_router(health.router, prefix="/api")

    # Mounted last because a mount at "/" matches every path not routed above.
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()
