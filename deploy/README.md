# Deploy — Tito's Stats API

Production stack for `api.titoscourts.com`. Runs on a single Hostinger VPS as three docker-compose services: **postgres**, **api** (FastAPI), **caddy** (TLS + reverse proxy).

Backend code lives in `../api/`. The Dockerfile is `../api/Dockerfile`. This directory holds only the orchestration + secrets template.

**SSH is Tailscale-only.** UFW allows port 22 on `tailscale0` exclusively — the public IP is for Caddy (80/443) only. If you lose Tailscale access (locked out of the tailnet, daemon dead, key expired), recover via the **Hostinger Console** (browser VNC) and re-run `tailscale up`.

---

## Initial deploy (one-time per VPS)

Prereqs on the VPS: Docker + Compose plugin installed, DNS A record for `api.titoscourts.com` → public IP resolving, ports 80/443 open publicly, Tailscale running, `/srv/titos-stats` owned by your deploy user. See top-level `VPS_SETUP.md`.

Paste-able block — run top-to-bottom. Sections marked `===` mark a context switch.

```bash
# ═════════════════════════════════════════════════════════════════════
# === On the VPS (Tailscale only) ===
#     ssh tej@100.85.238.62      # tailscale IP
#     ssh tej@titos-vps          # tailscale MagicDNS
# ═════════════════════════════════════════════════════════════════════

# 1. Prepare the project directory (idempotent). The optional rm line
#    only runs if you're intentionally re-cloning from scratch — leave
#    it commented out for a normal first deploy.
sudo mkdir -p /srv/titos-stats
sudo chown tej:tej /srv/titos-stats
cd /srv/titos-stats
# Uncomment the next line ONLY for a wipe-and-redeploy:
# rm -rf /srv/titos-stats/{*,.[!.]*}
git clone git@github.com:hplehal/titos-stats-ai.git .
#  ↑ If your VPS doesn't have GitHub SSH set up yet, swap for HTTPS:
#    git clone https://github.com/hplehal/titos-stats-ai.git .

# 2. Seed the .env file
cp deploy/.env.example deploy/.env

# 3. Generate secrets — echo them so you can mirror API_KEY into the
#    laptop's web/.env.production.local later.
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
API_KEY=$(openssl rand -hex 32)
echo "POSTGRES_PASSWORD = $POSTGRES_PASSWORD"
echo "API_KEY           = $API_KEY"
echo "                    # ← mirror this into web/.env.production.local"

# 4. Inject the generated values into deploy/.env.
#    API_KEY first because its placeholder string contains CHANGE_ME as
#    a prefix — replacing the longer pattern first avoids partial overlap.
sed -i "s|CHANGE_ME_GENERATE_FRESH_FOR_PROD|$API_KEY|" deploy/.env
sed -i "s|CHANGE_ME|$POSTGRES_PASSWORD|g" deploy/.env

# 5. Fill in R2 creds + spot-check the URLs match the new password
vim deploy/.env
#    Edit:   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL
#    Verify: DATABASE_URL and DIRECT_URL both end with @postgres:5432/titos
#    Verify: POSTGRES_PASSWORD line matches what's embedded in the URLs

# 6. Lock down the secrets file
chmod 600 deploy/.env

# 7. First deploy — builds, starts, tails 10s of api logs, prints `ps`
./deploy/deploy.sh

# ═════════════════════════════════════════════════════════════════════
# === From your laptop ===
# ═════════════════════════════════════════════════════════════════════

# 8. Verify the full chain (DNS → Caddy → cert → reverse proxy → api)
curl -i https://api.titoscourts.com/healthz
# Expected:
#   HTTP/2 200
#   content-type: application/json
#   {"status":"ok"}

# 9. (Optional) Eyeball the FastAPI docs in a browser
#    open https://api.titoscourts.com/docs

# 10. Point the laptop's PROD-mode frontend at prod. Use a separate
#     env file so `npm run dev` keeps using localhost via .env.local.
#     Next.js auto-loads .env.production.local during `next build` /
#     `next start` but ignores it during `next dev`.
cat > web/.env.production.local <<'EOF'
NEXT_PUBLIC_API_URL=https://api.titoscourts.com
NEXT_PUBLIC_API_KEY=<API_KEY value from step 3>
EOF
# Then to run against prod:
#   cd web && npm run build && npm run start

# 11. Tag the shipped state
git tag phase-1-shipped
git push --tags
```

---

## Redeploy (every code change)

```bash
ssh tej@titos-vps
cd /srv/titos-stats
./deploy/deploy.sh
```

The script does `git pull --ff-only`, `docker compose up -d --build`, and tails the api logs for 10s so you spot migration errors before disconnecting. Alembic migrations run automatically at container start; no separate step needed.

---

## Rollback

Every shipped state is tagged (`phase-1-shipped`, etc.). To roll back to a known-good tag:

```bash
ssh tej@titos-vps
cd /srv/titos-stats

git fetch --tags
git checkout <tag-name>            # detached HEAD is fine for ops
./deploy/deploy.sh                  # rebuild + restart on that revision
```

**Schema rollback caveat.** `deploy.sh` runs `alembic upgrade head` on start, so checking out an *older* tag will leave the DB at a *newer* schema head — fine as long as the old app still understands the newer schema (additive migrations are forward-compatible). For a destructive schema rollback, exec into the api container first and run `alembic downgrade <revision>` to bring the DB back down, then redeploy the tag.

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

# Caddy auto-issued cert details
curl -sIv https://api.titoscourts.com/healthz 2>&1 | grep -E '^\*\s*(Server|subject)'

# Live FastAPI docs
open https://api.titoscourts.com/docs
```

**Laptop, prod-mode frontend** — `web/.env.production.local`:
```
NEXT_PUBLIC_API_URL=https://api.titoscourts.com
NEXT_PUBLIC_API_KEY=<same value as deploy/.env API_KEY on the VPS>
```
Then `cd web && npm run build && npm run start`. Local dev (`npm run dev`) continues to read `web/.env.local` against localhost — the two configs don't conflict.

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

- **SSH** is Tailscale-only. UFW rule pins port 22 to the `tailscale0` interface. Public IP is reserved for HTTP/HTTPS (Caddy on 80/443). Recovery path if you lose Tailscale: Hostinger Console → re-establish Tailscale.
- **Postgres has no published port** — only reachable on the compose-internal network. To get a psql shell, use `docker compose exec` as above.
- **Caddy** mounts `Caddyfile` read-only and persists `caddy_data` (the cert + ACME state) so renewals survive container restarts.
- **api healthcheck** uses Python stdlib (no curl in `python:3.12-slim`), hitting `localhost:8000/healthz` from inside the container.
- **Alembic** runs on every container start; it's a no-op when the schema is already at head.
