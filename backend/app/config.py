import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# The defaults suit a local checkout. The Docker image sets all of these.
DB_PATH = Path(os.environ.get("PRELEGAL_DB_PATH", REPO_ROOT / "backend" / "prelegal.db"))
STATIC_DIR = Path(os.environ.get("PRELEGAL_STATIC_DIR", REPO_ROOT / "frontend" / "out"))
DOCUMENTS_PATH = Path(
    os.environ.get("PRELEGAL_DOCUMENTS_PATH", REPO_ROOT / "documents" / "documents.json")
)
# Secure by default. docker-compose.yml turns this off for local plain HTTP.
COOKIE_SECURE = os.environ.get("PRELEGAL_COOKIE_SECURE", "true").lower() != "false"
# The Next.js dev server is another origin. In Docker, the backend serves the frontend.
CORS_ORIGINS = [
    origin
    for origin in os.environ.get("PRELEGAL_CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin
]
