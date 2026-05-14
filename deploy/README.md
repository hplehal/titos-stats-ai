# Deploy — Tito's Stats API

Production stack for `api.titoscourts.com`. Runs on a single Hostinger VPS as three docker-compose services: **postgres**, **api** (FastAPI), **caddy** (TLS + reverse proxy).

Backend code lives in `../api/`. The Dockerfile is `../api/Dockerfile`. This directory holds only the orchestration + secrets template.

---

## Initial setup (one-time per VPS)

Prereqs on the VPS: Docker + Compose plugin installed, DNS A record for `api.titoscourts.com` resolving here, ports 80/443 open. See top-level `VPS_SETUP.md`.

```bash
ssh tej@82.25.91.197

# Clone repo
sudo mkdir -p /srv/titos-stats && sudo chown "$USER" /srv/titos-stats
cd /srv/titos-stats
git clone https://github.com/<YOUR_HANDLE>/titos-ai.git .

# Configure secrets
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
vim deploy/.env   # fill in POSTGRES_PASSWORD, API_KEY, R2_* — see notes below

# First deploy
./deploy/deploy.sh
```

`.env` must contain matching credentials in two places (Postgres uses `POSTGRES_*` directly; the api uses `DATABASE_URL`). Keep the password identical in both.

Generate strong values:
```bash
openssl rand -base64 32 | tr -d '/+=' | head -c 40   # POSTGRES_PASSWORD
openssl rand -hex 32                                  # API_KEY
```

---

## Redeploy (every code change)

```bash
ssh tej@82.25.91.197
cd /srv/titos-stats
./deploy/deploy.sh
```

The script does `git pull --ff-only`, `docker compose up -d --build`, and tails the api logs for 10s so you spot migration errors before disconnecting. Alembic migrations are run automatically at container start; no separate step needed.

---

## Rollback

Every shipped state is tagged (`phase-1-shipped`, etc.). To roll back to a
known-good tag:

```bash
ssh tej@82.25.91.197
cd /srv/titos-stats

git fetch --tags
git checkout <tag-name>            # detached HEAD is fine for ops
./deploy/deploy.sh                  # rebuild + restart on that revision
```

**Note on schema rollbacks.** `deploy.sh` runs `alembic upgrade head` on
start, so checking out an *older* tag will leave the DB at a *newer*
schema head — fine as long as the old app still understands the newer
schema (additive migrations are forward-compatible). For a destructive
schema rollback, exec into the api container first and run
`alembic downgrade <revision>` to bring the DB back down, then redeploy
the tag.

To return to `main` after a rollback:
```bash
git checkout main
./deploy/deploy.sh
```

---

## Verifying

```bash
# Healthcheck — should be {"status":"ok"}
curl -sf https://api.titoscourts.com/healthz

# Caddy auto-issued cert
curl -sIv https://api.titoscourts.com/healthz 2>&1 | grep -E '^\*\s*(Server|subject)'

# Live FastAPI docs
open https://api.titoscourts.com/docs
```

Local frontend pointed at prod:
```bash
# in web/.env.local
NEXT_PUBLIC_API_URL=https://api.titoscourts.com
NEXT_PUBLIC_API_KEY=<the same value as deploy/.env API_KEY>
```
Restart `npm run dev`.

---

## Operations

**Logs (live):**
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api
```

**Logs (since last 100 lines):**
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs --tail=100
```

**Restart just the api container** (e.g. after a config change without code change):
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart api
```

**Shell into the api container:**
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api bash
```

**Postgres shell:**
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

**Backup the database** (run from VPS, dump lands locally):
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "titos-$(date +%F).sql.gz"
```

**Tear it all down (keeps the data volume):**
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
```

**Nuke the data volume too** (irreversible — only after a fresh backup):
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down -v
```

---

## Architecture notes

- Postgres has **no published port** — only reachable on the compose-internal network. To get a psql shell, use `docker compose exec` as above.
- Caddy mounts `Caddyfile` read-only and persists `caddy_data` (the cert + ACME state) so renewals survive container restarts.
- The api healthcheck uses Python stdlib (no curl in `python:3.12-slim`), hitting `localhost:8000/healthz` from inside the container.
- Alembic runs on every container start; it's a no-op when the schema is already at head.
