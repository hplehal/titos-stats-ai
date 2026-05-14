#!/usr/bin/env bash
# Pulls the latest main, rebuilds, and tails the api log so you can see
# startup errors before the SSH session ends. Run from /srv/titos-stats
# on the VPS.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="deploy/docker-compose.yml"
ENV_FILE="deploy/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Missing $ENV_FILE — copy deploy/.env.example and fill in real values first."
  exit 1
fi

echo "→ Pulling latest main…"
git pull --ff-only

echo "→ Building + (re)starting containers…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo "→ Tailing api logs for 10s (Ctrl-C to detach early)…"
timeout 10 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f api || true

echo
echo "→ Container status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo
echo "Done. Verify:"
echo "  curl -sf https://api.titoscourts.com/healthz"
