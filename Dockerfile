# Build the static frontend. `next build` reads ../templates, so both stay siblings.
FROM node:24-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY templates/ ../templates/
RUN npm run build

# Install the locked backend dependencies.
FROM python:3.12-slim AS backend
COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /bin/uv
ENV UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev

# Secrets such as OPENROUTER_API_KEY are supplied at runtime, never built in.
FROM python:3.12-slim
RUN useradd --create-home prelegal
WORKDIR /app
COPY --from=backend /app/.venv .venv
COPY backend/app app
COPY --from=frontend /build/frontend/out static
ENV PATH="/app/.venv/bin:$PATH" \
    PRELEGAL_DB_PATH=/tmp/prelegal.db \
    PRELEGAL_STATIC_DIR=/app/static
USER prelegal
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
