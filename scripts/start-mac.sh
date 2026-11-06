#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Warning: .env not found. Copy .env.example to .env and set OPENROUTER_API_KEY." >&2
fi

docker compose up --detach --build --wait
echo "Prelegal is running at http://localhost:8000"
