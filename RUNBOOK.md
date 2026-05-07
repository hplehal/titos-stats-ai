# Claude Code Runbook — Volleyball Stat Tracker (Phase 1, Path A)

Pair this with `PROJECT_BRIEF.md` and `VPS_SETUP.md`. Work through the sessions top to bottom. Each session has a prompt to paste verbatim, a verification checklist, and a commit point.

---

## How to use this doc

- Each session = one focused chunk. Don't merge them.
- **Commit between every session.** Easy rollback if Claude Code goes sideways.
- Use `/clear` between unrelated sessions to free context.
- For prompts that touch many files, hit **Tab** to enter Plan Mode — Claude outlines what it'll do before touching files. Approve before execution.
- If something breaks, paste the error verbatim into Claude Code. Better at debugging from real output than your description.
- **Keep two terminal windows open while developing**: one for `make api-dev`, one for `cd web && npm run dev`. Claude Code runs alongside.

---

## Session 0 — One-time setup (~30 min)

### 0.1 Local prerequisites

Install on your laptop:
- **Node.js 20+** (`node --version`)
- **Python 3.12** (`python3 --version`)
- **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Docker Desktop** (for local Postgres in dev)
- **ffmpeg** — `brew install ffmpeg`
- **Claude Code** — `curl -fsSL https://claude.ai/install.sh | bash` (or `npm install -g @anthropic-ai/claude-code`)

Verify:
```bash
node --version
python3 --version
uv --version
docker --version
ffmpeg -version
claude --version
claude doctor
```

### 0.2 Provision external accounts

You need:
- **[Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)** — S3-compatible object storage
  - Create a bucket called `titos-stats-videos`
  - Create an R2 API token with Object Read & Write access → save `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - Configure public access for the bucket (or set up a custom domain) → save `R2_PUBLIC_URL`
- **[Anthropic Console](https://console.anthropic.com)** — for the API key (Phase 3+)
  - Save `ANTHROPIC_API_KEY` for later (not used in Phase 1)

You don't need Vercel or Modal yet. The VPS handles backend; frontend stays local for Phase 1.

### 0.3 Run the VPS prep in parallel (whenever)

Follow `VPS_SETUP.md` to wipe and prep your Hostinger VPS. **You can do this any time before Session 10.** Doesn't block Phase 1 development.

### 0.4 Create the monorepo

```bash
mkdir titos-stats && cd titos-stats
git init
mkdir api web deploy
```

Drop `PROJECT_BRIEF.md`, `RUNBOOK.md`, and `VPS_SETUP.md` in the root.

Create `.env.example`:
```bash
# Database (local dev)
DATABASE_URL=postgresql+asyncpg://titos:devpw@localhost:5432/titos
DIRECT_URL=postgresql://titos:devpw@localhost:5432/titos

# R2 Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=titos-stats-videos
R2_PUBLIC_URL=https://...

# CORS
CORS_ORIGINS=http://localhost:3000

# Anthropic (Phase 3+)
ANTHROPIC_API_KEY=

# Frontend → backend URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Copy to `.env.local` (don't commit) and fill in real R2 values.

`.gitignore`:
```
.env
.env.local
.env.*.local
node_modules/
.next/
api/.venv/
api/__pycache__/
api/**/__pycache__/
api/.pytest_cache/
*.pyc
*.log
.DS_Store
weights/
```

Initial commit:
```bash
git add .
git commit -m "Initial: project brief, runbook, VPS setup guide"
```

---

## Session 1 — Bootstrap Claude Code (~15 min)

Start in the repo:
```bash
claude
```

### Prompt 1.1 — orient

```
Read PROJECT_BRIEF.md, RUNBOOK.md, and VPS_SETUP.md in this directory.

Do NOT write any code yet. Instead:

1. Summarize in 5 bullets what you understand the project to be.
2. Confirm the architecture: monorepo with api/ (Python FastAPI) + web/ (Next.js); Python service owns the database; production deploys to a Hostinger VPS at api.titoscourts.com behind Caddy.
3. List the key assumptions you'd be working under.
4. Ask any clarifying questions before we start Phase 1.
5. Flag anything in the brief that seems risky, ambiguous, or likely to bite us later.

After I answer, we'll start Phase 1 — manual MVP only, no AI yet.
```

**Verify:** Read its summary carefully. If it misunderstood the architecture, correct it now.

### Prompt 1.2 — generate CLAUDE.md

```
/init
```

Append to the generated `CLAUDE.md`:

```
## Project conventions
- Monorepo: api/ (Python FastAPI) + web/ (Next.js).
- Python service owns the database. The web app NEVER talks to the DB directly — only via the api/ HTTP service.
- Python: 3.12, uv for deps, async SQLAlchemy 2.0, Alembic for migrations.
- TypeScript: strict mode. Generate API client types from FastAPI's OpenAPI spec.
- Time values: floats in seconds.
- Stats are derived from Play, never stored.
- Phase 1 is manual-only — do not build any ML or AI features unless explicitly asked.
- Use TanStack Query on the frontend for server state.
- Use shadcn/ui for all interactive components.
- Optimistic UI for play entry — never await before updating local state.
- Production: Hostinger VPS, Docker Compose, Caddy reverse proxy at api.titoscourts.com. Don't introduce other deploy targets.
```

Commit:
```bash
git add CLAUDE.md
git commit -m "Add CLAUDE.md with project conventions"
```

---

## Session 2 — FastAPI scaffold + Postgres (~45 min)

**Goal:** Working FastAPI service running locally against a Dockerized Postgres, with health endpoint and Alembic ready.

### Prompt 2.1

```
Build Phase 1 step 1: project bootstrap.

Tasks:
1. Create docker-compose.dev.yml at the repo root with a single Postgres 16 service exposed on 5432, named volume for persistence, env: POSTGRES_USER=titos POSTGRES_PASSWORD=devpw POSTGRES_DB=titos.

2. In api/, init a uv project (uv init). Set Python 3.12 as the requirement. Add deps:
   - fastapi, uvicorn[standard]
   - sqlalchemy[asyncio], asyncpg, alembic
   - pydantic, pydantic-settings, python-multipart
   - boto3, cuid2, python-dotenv
   Dev deps: pytest, pytest-asyncio, httpx, ruff, mypy

3. Create api/src structure:
   - main.py: FastAPI app with CORS reading from CORS_ORIGINS env var (comma-separated), /healthz endpoint
   - config.py: Pydantic Settings reading from env (DATABASE_URL, R2_*, CORS_ORIGINS, ANTHROPIC_API_KEY)
   - db.py: async SQLAlchemy engine + session factory; Base class
   - models.py: imports Base only for now
   - routers/__init__.py
   - schemas.py: empty

4. Init Alembic in api/ pointing to api/src/models.py for autogeneration. Use the async template (alembic init -t async alembic). Configure env.py to read DATABASE_URL from settings.

5. Add a Makefile at the repo root with:
   - make db-up     : docker compose -f docker-compose.dev.yml up -d
   - make db-down   : docker compose -f docker-compose.dev.yml down
   - make api-dev   : cd api && uv run uvicorn src.main:app --reload --port 8000
   - make migrate   : cd api && uv run alembic upgrade head
   - make migration name=...: cd api && uv run alembic revision --autogenerate -m "$(name)"
   - make seed      : cd api && uv run python -m src.seed

6. Verify by:
   - make db-up succeeds
   - make api-dev starts on :8000 with no errors
   - curl localhost:8000/healthz returns {"status": "ok"}
   - make migration name=init creates an empty migration file
   - make migrate runs cleanly

If anything fails, show me the error and stop — don't keep retrying.
```

**Verify:**
- `make db-up` brings up Postgres
- `make api-dev` runs FastAPI on :8000
- `curl localhost:8000/healthz` returns ok
- `localhost:8000/docs` shows the FastAPI docs UI
- `make migrate` runs without errors

**Commit:**
```bash
git add -A && git commit -m "FastAPI scaffold + Alembic + Docker Postgres"
```

---

## Session 3 — Data model + roster CRUD (~1 hr)

**Goal:** All models defined and migrated, plus seasons/teams/players endpoints.

### Prompt 3.1

```
Build Phase 1 step 2: data model and roster CRUD.

Tasks:
1. In api/src/models.py, define ALL models from PROJECT_BRIEF.md (Season, Team, Player, Match, VideoAsset, Rally, Play) using SQLAlchemy 2.0 async + Mapped/mapped_column syntax. Use cuid2 for ID generation. Use enums for PlayAction and PlayResult. All timestamps timezone-aware. Add the unique constraint on (team_id, jersey_number).

2. Generate the migration: make migration name=add_full_schema, then make migrate. Verify all tables exist.

3. In api/src/schemas.py, define Pydantic v2 schemas for create / update / read of Season, Team, Player. Use ConfigDict(from_attributes=True) for read schemas.

4. Create api/src/routers/seasons.py, teams.py, players.py. Each gets:
   - GET /          list
   - POST /         create
   - GET /{id}      read (with relevant nested data)
   - PATCH /{id}    update
   - DELETE /{id}   delete
   - Nested: GET /seasons/{id}/teams, GET /teams/{id}/players

5. Wire all three routers into main.py under /seasons, /teams, /players prefixes.

6. Validation:
   - Player jersey_number required, int 0–99, unique within team (DB constraint enforces; surface a 409 with clear message via SQLAlchemy IntegrityError handler)
   - Cannot delete a Season that has Matches (return 409 with reason)

7. Add api/tests/test_roster.py covering: create season → create team in season → add 2 players → enforce jersey uniqueness → delete player.

8. Verify with pytest and manually via /docs.
```

**Verify:**
- `cd api && uv run pytest` passes
- `localhost:8000/docs` lets you create a season, team, players manually
- Adding two players with the same jersey number on the same team fails with 409
- Submitting a player without a jersey number fails validation

**Commit:**
```bash
git add -A && git commit -m "Data model + roster CRUD endpoints"
```

---

## Session 4 — Next.js scaffold + roster UI (~1 hr)

**Goal:** Next.js app calling the FastAPI for roster management.

### Prompt 4.1

```
Build Phase 1 step 3: Next.js frontend with roster UI.

Tasks:
1. In web/, scaffold Next.js 15 with App Router, TypeScript, Tailwind, src/app structure, no eslint wizard, default import alias.

2. Install:
   - @tanstack/react-query, @tanstack/react-query-devtools
   - openapi-typescript (dev), openapi-fetch
   - zod
   - clsx, tailwind-merge, lucide-react
   - sonner (toasts)

3. Install shadcn/ui and add: button, input, label, dialog, select, table, tabs, badge, card, separator, sonner.

4. API client setup:
   - Add script to package.json: "gen:api": "openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.ts"
   - Create src/lib/api.ts using openapi-fetch with the generated types and process.env.NEXT_PUBLIC_API_URL as the base.
   - Run npm run gen:api once (assume API running on :8000).

5. TanStack Query setup: provider in src/app/providers.tsx, wrap children in src/app/layout.tsx.

6. Build pages:
   - / (home): list seasons + "New Season" dialog
   - /seasons/[id]: show teams in season with "New Team" button, plus list of matches (empty for now)
   - /teams/[id]: show team name (editable inline) and roster table with add/edit/delete dialog rows. Jersey number REQUIRED in form; reject empty submissions client-side.

7. Use TanStack Query useMutation with optimistic updates for all writes. Use sonner for toasts. Show 409 errors clearly.

8. Top header with link to home. Single column, max-w-4xl. No fancy layout.

9. Verify: with API running (make api-dev) and web running (cd web && npm run dev), I can create a season → create teams → add players. Player creation must reject empty jersey numbers.
```

**Verify:**
- `npm run dev` boots cleanly at :3000
- Create a season "S7 Sunday Mens Test"
- Create two teams, add 6 players each with jerseys
- Try to submit a player without a jersey → form rejects
- Try to add two players with same jersey to one team → 409 toast

**Commit:**
```bash
git add -A && git commit -m "Next.js scaffold + roster UI calling FastAPI"
```

---

## Session 5 — R2 video upload + match creation (~1 hr)

**Goal:** Create a match, upload a video to R2 via presigned URL, see it play back.

### Prompt 5.1

```
Build Phase 1 step 4: match creation with R2 video upload.

Backend (api/):
1. Add api/src/storage.py with boto3 R2 client using R2 endpoint URL from config.
2. Endpoint POST /uploads/presign — body: {filename, contentType}. Returns: {uploadUrl, publicUrl, key}. Presigned URL accepts PUT for ~1 hour. Validate contentType is video/mp4. Generate key as "matches/{cuid}/{filename}".
3. Endpoint POST /matches — body: season_id, home_team_id, away_team_id, played_at, video_key, video_duration (optional float). Creates a Match AND a VideoAsset (kind="raw") in one transaction. Validate home_team_id != away_team_id and both belong to the season.
4. GET /matches/{id} — returns match + nested teams + raw video URL (R2_PUBLIC_URL + key).

Frontend (web/):
5. /matches/new page: form with season select, home team select, away team select (filtered to season; disabled until season picked; cannot be same team), played_at datetime input, mp4 file input.
   - Upload flow: pick file → POST /uploads/presign → PUT file directly to uploadUrl with progress bar → POST /matches with the key on success.
   - Show upload % progress. Disable submit while uploading.
6. /matches/[id]: show match metadata (teams, date) and the video in HTML5 <video> with controls. Tracker UI comes next session.
7. Link "New Match" button on /seasons/[id] to /matches/new?seasonId=...
8. Update match list on /seasons/[id] to show real matches.

Verify with a real ~30-second mp4 from your phone.
```

**Verify:**
- Record / grab a short MP4
- Upload via /matches/new → progress bar shows → match created
- /matches/[id] plays the video back
- Refresh → video still loads

**Commit:**
```bash
git add -A && git commit -m "R2 video upload + match creation"
```

---

## Session 6 — Tracker UI shell (~1.5 hrs)

**Goal:** Tracker page layout, video player with custom controls, rally panel, hotkeys.

### Prompt 6.1

```
Build Phase 1 step 5a: tracker UI shell on /matches/[id].

Backend (api/):
1. Endpoints:
   - GET /matches/{id}/rallies — list rallies + plays
   - POST /matches/{id}/rallies — create with start_time, set_number
   - PATCH /rallies/{id} — update end_time, point_won_by
   - DELETE /rallies/{id} — cascade-delete plays
2. Pydantic schemas for all of these.

Frontend (web/):
3. /matches/[id] becomes the tracker page. Desktop-only layout.
4. Layout:
   - Top: match header with home vs away + live score (computed from rallies with point_won_by).
   - Two-column grid: left 60% video, right 40% rally panel.
   - Bottom: hotkey hint bar.
5. Video panel:
   - HTML5 video with custom controls below: play/pause, seek bar, current time / total time, playback speed (0.5x, 1x, 1.5x, 2x), 5s skip back/forward.
   - currentTime as "MM:SS.s" prominently above controls.
6. Rally panel:
   - Header: set selector tabs (1, 2, 3) with active highlighted; "+ New Set" advances active set.
   - List of rallies in active set as cards: rally number, start → end time, point won chip, play count.
   - Below list: "Start Rally" button when no rally active.
   - When rally active: show "Active rally — start at MM:SS" with End Rally button (play entry comes next session).
7. Hotkeys (useEffect with keydown listener; ignore when input focused):
   - Space: play/pause
   - ← / →: seek -2s / +2s
   - R: start rally if none active, else end rally (require pointWonBy via dialog)
   - 1 / 2 / 3: switch active set tab
   Show all hotkeys in bottom bar.
8. TanStack Query for rallies; optimistic updates on rally create / end.

Verify by creating a few rallies on the test match.
```

**Verify:**
- Open match page → video plays, custom controls work
- Press R → active rally; press R → dialog → rally appears in list
- Switch sets via tab or 1/2/3 hotkey → rallies filter correctly

**Commit:**
```bash
git add -A && git commit -m "Tracker UI shell with hotkeys, custom controls, rally CRUD"
```

---

## Session 7 — Play entry + live stats (~2 hrs)

**Goal:** The actual stat-tracking heart. Persist plays. Show live stats.

### Prompt 7.1

```
Build Phase 1 step 5b: play entry, persistence, live stats.

Backend (api/):
1. Endpoints:
   - GET /rallies/{id}/plays — list
   - POST /rallies/{id}/plays — create with player_id, action, result; auto-increment sequence
   - PATCH /plays/{id} — update fields
   - DELETE /plays/{id} — delete + re-pack sequence numbers in same rally
2. Implement api/src/stats.py with derive_match_stats(match_id) returning per-team and per-player dict with all derived stats (kills, attack errors, aces, service errors, blocks, digs, reception errors, assists, total points). Include the assist rule: SET immediately preceding KILL by same team.
3. Endpoint GET /matches/{id}/stats returning the derived stats.

Frontend (web/):
4. Active rally drawer (right panel, replaces stub):
   - Team toggle row: Home / Away. H/A keys toggle.
   - Player picker: row of buttons, one per player on active team, "#23 Lehal" format. Selected highlights. 1–9 keys = pick player at index.
   - Action button row: Serve, Pass, Set, Attack, Block, Dig, Freeball. Q W E R T Y U keys.
   - Result button row: Success, Error, Continued. S X C keys.
   - Two-key combo creates the play: action then result auto-commits with selected player + team.
   - Below: list of plays in current rally with delete buttons.
   - End Rally opens dialog with Home/Away point won.

5. Live stats panel: collapsible at top of right column (collapsed by default).
   - Per team: K, attack errors, Aces, service errors, B, D, reception errors, total points.
   - Per player top 5 by kills, top 5 by digs.
   - Reads from /matches/{id}/stats; refetches whenever a play mutation succeeds.
   - TanStack Query key invalidation after mutations.

6. Match score in header updates from points-won-by aggregate.

7. Optimistic UI for play entry — append to local cache immediately, roll back on error.

Verify with a real 2–3 minute clip tracked end-to-end. Use only hotkeys for the second pass.
```

**Verify:**
- Track a real short clip with hotkeys only
- Score and stats update live
- Delete a play → sequence renumbers, stats update
- Reload page → all data persists

**Commit:**
```bash
git add -A && git commit -m "Play entry, persistence, live stats"
```

---

## Session 8 — Summary + CSV export (~30 min)

```
Build Phase 1 step 6: match summary page + CSV export.

Backend (api/):
1. GET /matches/{id}/export.zip — returns zip with two CSVs:
   - plays.csv: rally_id, set_number, start_time, end_time, sequence, team, player_name, jersey, action, result
   - stats.csv: one row per player with all stats, plus team totals row at bottom of each team
   Use zipfile + io.BytesIO; stream as application/zip with Content-Disposition attachment.

Frontend (web/):
2. /matches/[id]/summary:
   - Per-set breakdown table: set number, score, top 3 plays per team by impact.
   - Team stat tables: rows = team, columns = K, E, Aces, SE, B, D, RE, Pts.
   - Per-player stat table for each team, same columns + Assists.
   - "Export CSV" button hits /export.zip.
3. Add link to summary from /matches/[id].

Verify: numbers match what you tracked. Export downloads cleanly.
```

**Verify:**
- Summary numbers match hand-count from session 7
- Zip downloads, both CSVs open in Numbers/Excel
- Spot-check one player's row

**Commit:**
```bash
git add -A && git commit -m "Match summary + CSV export"
```

---

## Session 9 — Seed + polish (~30 min)

```
Build Phase 1 step 7: seed script and polish.

Backend (api/):
1. Create api/src/seed.py: drops + recreates demo data — one Season "Demo Season", two Teams "Tito Sharks" / "Tito Bolts" with 8 players each (realistic names, jersey numbers 1–8), one demo Match without a video.
2. `make seed` already wired in Session 2's Makefile.

Frontend (web/):
3. Empty state on home when no seasons exist.
4. Sticky footer on tracker: "All changes saved" with small spinner during pending mutations.
5. Run npm run build and fix any type errors.

Cleanup:
6. Add a README.md at the repo root: prereqs, "make db-up && make migrate && make seed && make api-dev && (in another shell) cd web && npm run dev", env var reference, link to VPS_SETUP.md and PROJECT_BRIEF.md.
7. List any TypeScript / Python warnings or unused deps and fix them.
```

**Verify:**
- `make seed` populates DB
- No console errors in browser
- `npm run build` and `cd api && uv run mypy src` both succeed

**Commit:**
```bash
git add -A && git commit -m "Seed script, README, polish"
git tag phase-1-local-complete
```

🎉 You can now use the tracker locally for real Tito's matches.

---

## Session 10 — Deploy backend to VPS (~1.5 hrs)

**Prerequisite:** `VPS_SETUP.md` complete — Ubuntu installed, Docker working, DNS A record for `api.titoscourts.com` resolving.

```
Deploy Phase 1: backend to api.titoscourts.com.

Tasks:
1. Create api/Dockerfile:
   - Multi-stage: builder stage with uv to install deps; runtime stage with python:3.12-slim
   - Install ffmpeg in runtime
   - Copy api/src and api/alembic into the image
   - CMD runs alembic upgrade head, then uvicorn src.main:app --host 0.0.0.0 --port 8000

2. Create deploy/docker-compose.yml at the repo root with three services:
   - postgres: image postgres:16-alpine, named volume titos_pgdata, env from .env, internal network only (no exposed port)
   - api: build context ../api, depends_on postgres, env from .env, internal port 8000, healthcheck against /healthz
   - caddy: image caddy:2-alpine, ports 80 + 443, mounts deploy/Caddyfile and a caddy_data volume, depends_on api

3. Create deploy/Caddyfile:
   ```
   api.titoscourts.com {
       reverse_proxy api:8000
       encode gzip zstd
   }
   ```
   Caddy auto-fetches Let's Encrypt certs.

4. Create deploy/.env.example with all production env vars (DATABASE_URL pointing to the postgres service, R2_*, CORS_ORIGINS=https://stats.titoscourts.com,http://localhost:3000, ANTHROPIC_API_KEY).

5. Create a deploy script deploy/deploy.sh that on the VPS:
   - Pulls latest from main
   - Runs docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   - Tails logs for 10 seconds to confirm startup
   Make it executable.

6. Update api/src/main.py CORS to read CORS_ORIGINS from env (comma-separated). Verify it allows https://stats.titoscourts.com (for Phase 5) and http://localhost:3000 (for current dev).

7. Document the manual deploy steps in deploy/README.md:
   - Initial: clone repo to /srv/titos-stats on VPS, copy .env, run deploy.sh
   - Subsequent: ssh in, git pull, run deploy.sh

Don't actually run any of this on the VPS yet — just produce the artifacts. I'll execute the deploy myself after reviewing.
```

**Then manually on the VPS:**

```bash
ssh tej@82.25.91.197

# Initial deploy
cd /srv/titos-stats
git clone <your repo url> .
cp deploy/.env.example deploy/.env
vim deploy/.env    # fill in real values

# Generate a strong DB password and set it both in .env and as POSTGRES_PASSWORD
chmod +x deploy/deploy.sh
./deploy/deploy.sh

# Watch the logs
docker compose -f deploy/docker-compose.yml logs -f
```

**Verify:**
- `https://api.titoscourts.com/healthz` returns `{"status": "ok"}` (Caddy auto-issued the cert)
- `https://api.titoscourts.com/docs` shows the FastAPI docs
- Update your local `web/.env.local` to `NEXT_PUBLIC_API_URL=https://api.titoscourts.com`
- Restart `npm run dev` — your local frontend now talks to the production backend
- Create a season on production, add a team, upload a video, track a rally end-to-end

**Commit:**
```bash
git add -A && git commit -m "Deploy: VPS production at api.titoscourts.com"
git tag phase-1-shipped
```

🎉 You've shipped Phase 1.

---

## Working tips for Claude Code

**Plan Mode (Tab):** Before any prompt that touches >5 files, hit Tab. Claude outlines what it'll do, you approve.

**`/clear` vs `/compact`:**
- `/clear` — wipe context, fresh start. Use between sessions.
- `/compact` — summarize current context to free space. Use mid-session.

**Reference files explicitly:** `@PROJECT_BRIEF.md` or `@api/src/models.py` makes Claude actually read them.

**When something's off:** "Stop, something's wrong" + paste the actual error. Don't let it spiral.

**Reverting:** `git reset --hard HEAD` recovers from a bad session quickly. This is why we commit between sessions.

**Two terminals during dev:** keep `make api-dev` running in one and `cd web && npm run dev` in another. Claude Code runs alongside.

**Regenerate API types:** after any backend change to schemas, run `npm run gen:api` in `web/`.

---

## After Phase 1: planning Phase 2 (rally detection)

Once Phase 1 is in your hands and you've used it for a real match, come back with:

1. How long did one match take to track end-to-end?
2. Which actions were slow / awkward? Highest-leverage AI targets.
3. Sample frames from a recorded match — let's see what the local action classifier does on Tito's footage before designing Phase 3 around assumptions.
4. A real rally-boundary ground-truth set (10–20 rallies hand-marked) so we can measure detector accuracy when we plug it in.

We'll write the Phase 2 kickoff prompt then, with concrete numbers instead of guesses.
