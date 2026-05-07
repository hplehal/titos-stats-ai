# Tito's Courts — Volleyball Video Stats Tracker

AI-first volleyball stat tracker. Upload match video → automatic rally detection, action classification, and player attribution → human review and correction → stats aggregate per player/team → CSV export and league dashboard.

Built on a forked / vendored version of [`masouduut94/volleyball_analytics`](https://github.com/masouduut94/volleyball_analytics) (open-source volleyball CV pipeline) with Claude vision API for high-level reasoning on ambiguous cases.

---

## Core principle: manual-first, AI-on-top

The whole tool must work without any AI. Every AI step proposes; the user confirms or edits. This avoids the trap of a half-working AI demo that's useless during an actual season — and gives you a usable product even if you never finish the AI layers.

Phase 1 ships a working **manual** tracker through the same Python API the AI layers will eventually call. Phases 2–4 layer AI proposals on top of the same data model.

---

## Architecture

```
┌────────────────────────────┐         ┌──────────────────────────────┐
│  Next.js (web)             │ ─HTTPS──▶│  FastAPI                     │
│  Local in dev              │         │  api.titoscourts.com         │
│  stats.titoscourts.com prod│         │  Hostinger VPS (Ubuntu 22.04)│
│                            │         │  Caddy → Docker → FastAPI    │
│  • Tracker UI              │         │                              │
│  • Video player            │         │  • REST endpoints            │
│  • Review/edit             │         │  • SQLAlchemy + Alembic      │
│  • Dashboards              │         │  • Postgres (same VPS)       │
└────────────────────────────┘         │  • ML pipeline (Phase 2+):   │
        │                              │    - YOLO (player/ball)      │
        │                              │    - Action classifier       │
        │                              │    - PaddleOCR (jerseys)     │
        │                              │    - Claude vision API       │
        │                              └──────────────────────────────┘
        │                                       │
        │            ┌──────────────────────────┴────────────────┐
        ▼            ▼                                           ▼
   ┌──────────┐ ┌─────────────┐                          ┌──────────────┐
   │ Postgres │ │ Cloudflare  │                          │ Anthropic    │
   │ on VPS   │ │ R2 (videos) │                          │ Claude API   │
   └──────────┘ └─────────────┘                          └──────────────┘
```

**Why this split:**
- Python is where 90% of the volleyball-AI ecosystem lives (PyTorch, YOLO, MediaPipe, OCR libs)
- Next.js is where you're fastest at building UI
- Single source of truth on the DB — Python service writes, web app reads via API only
- VPS is already paid through 2027 — sunk cost for compute
- Cloudflare R2 has free egress, so video streaming stays cheap
- `api.titoscourts.com` + `stats.titoscourts.com` keep the brand consistent and unlock Let's Encrypt HTTPS

---

## Hosting plan

### Development (Phase 1)
Everything runs on your laptop:
- Postgres in Docker (`docker compose -f docker-compose.dev.yml up`)
- FastAPI via `uv run uvicorn`
- Next.js via `npm run dev`
- No VPS interaction during build

### Production
- **Backend + Postgres**: Hostinger VPS (Ubuntu 22.04 LTS, 2 cores / 8 GB / 100 GB / Boston DC). Docker Compose for the lot.
- **Domain**: `api.titoscourts.com` → A record → `82.25.91.197`. Caddy on the VPS handles auto-HTTPS via Let's Encrypt.
- **Frontend (dev/Phase 1)**: stays local on your machine.
- **Frontend (Phase 5+ public)**: Vercel at `stats.titoscourts.com` (CNAME to `cname.vercel-dns.com`).
- **Video storage**: Cloudflare R2 from day one of real uploads.

### DNS records (Phase 1: just one)

| Subdomain | Type | Value | When |
|---|---|---|---|
| `api.titoscourts.com` | A | `82.25.91.197` | Phase 1 deploy (end) |
| `stats.titoscourts.com` | CNAME | `cname.vercel-dns.com` | Phase 5 |

---

## Repo layout (monorepo)

```
titos-stats/
├── api/                       # Python FastAPI service
│   ├── pyproject.toml         # uv-managed
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── src/
│   │   ├── main.py            # FastAPI app
│   │   ├── config.py          # Pydantic settings
│   │   ├── db.py              # SQLAlchemy session
│   │   ├── models.py          # ORM models
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── routers/           # endpoint groups
│   │   ├── stats.py           # stat derivation
│   │   ├── video.py           # ffmpeg helpers
│   │   ├── storage.py         # R2 client
│   │   └── ml/                # ML pipeline (Phases 2+)
│   ├── Dockerfile
│   └── tests/
├── web/                       # Next.js frontend
│   ├── package.json
│   └── src/
├── deploy/                    # Production deploy artifacts (lives on VPS)
│   ├── docker-compose.yml     # postgres + api + caddy
│   ├── Caddyfile
│   └── .env.example
├── docker-compose.dev.yml     # local Postgres only
├── .env.example
├── PROJECT_BRIEF.md
├── RUNBOOK.md
├── VPS_SETUP.md
└── README.md
```

---

## Stack

### Backend (`api/`)
| Layer | Choice | Notes |
|---|---|---|
| Language | Python 3.12 | |
| Framework | FastAPI | OpenAPI auto-docs, async, what `volleyball_analytics` already uses |
| ORM | SQLAlchemy 2.0 (async) | |
| Migrations | Alembic | |
| Package manager | `uv` | Fast, modern. `volleyball_analytics` already uses it |
| Validation | Pydantic v2 | |
| ML core | Vendored from `volleyball_analytics` | Phases 2+ |
| Object detection | Ultralytics YOLOv8 | Player + ball |
| Pose estimation | MediaPipe | Set/pass/dig discrimination |
| OCR | PaddleOCR | Better than EasyOCR for sports jerseys |
| LLM reasoning | `anthropic` SDK (Claude Sonnet 4.5 vision) | Ambiguous frames |
| Video | OpenCV + ffmpeg | Frame extraction, transcoding |

### Frontend (`web/`)
| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router | Matches titoscourts.com |
| Language | TypeScript | |
| Styling | Tailwind + shadcn/ui | |
| HTTP | TanStack Query | Server-state, caching, optimistic updates |
| API client | `openapi-typescript` generated from FastAPI's OpenAPI spec | End-to-end types |
| Auth | Skip for MVP | NextAuth later |

### Infrastructure
| Concern | Choice | Cost |
|---|---|---|
| Domain | `titoscourts.com` (already owned) — subdomains `api.` and `stats.` | $0 |
| TLS | Caddy + Let's Encrypt (auto) | $0 |
| DB | Postgres 16 in Docker on VPS | $0 (VPS already paid) |
| Video storage | Cloudflare R2 | ~$2/month |
| API hosting | Docker Compose on Hostinger VPS | $0 (VPS paid through 2027) |
| Frontend (Phase 1, dev) | Local | $0 |
| Frontend (Phase 5+ prod) | Vercel | $0 free tier |
| Reverse proxy | Caddy | $0 |
| **Monthly during active use** | **~$2** (R2 only) | |

---

## Data model

SQLAlchemy 2.0 models (Alembic-managed). `VideoAsset` decoupled from `Match` so we can store multiple processed artifacts per match (raw, transcoded preview, extracted clips).

```python
# api/src/models.py — sketch

class Season(Base):
    id: Mapped[str]
    name: Mapped[str]                  # "Sunday Mens S7"
    created_at: Mapped[datetime]

class Team(Base):
    id: Mapped[str]
    season_id: Mapped[str]
    name: Mapped[str]

class Player(Base):
    id: Mapped[str]
    team_id: Mapped[str]
    name: Mapped[str]
    jersey_number: Mapped[int]         # required, league rule
    __table_args__ = (UniqueConstraint("team_id", "jersey_number"),)

class Match(Base):
    id: Mapped[str]
    season_id: Mapped[str]
    home_team_id: Mapped[str]
    away_team_id: Mapped[str]
    played_at: Mapped[datetime]

class VideoAsset(Base):
    id: Mapped[str]
    match_id: Mapped[str]
    kind: Mapped[str]                  # "raw" | "preview" | "clip"
    storage_url: Mapped[str]           # R2 URL
    duration_seconds: Mapped[float | None]
    width: Mapped[int | None]
    height: Mapped[int | None]
    processed_at: Mapped[datetime | None]

class Rally(Base):
    id: Mapped[str]
    match_id: Mapped[str]
    set_number: Mapped[int]
    start_time: Mapped[float]          # seconds into video
    end_time: Mapped[float]
    point_won_by: Mapped[str | None]   # "home" | "away"
    ai_proposed: Mapped[bool] = False
    ai_confirmed: Mapped[bool] = False

class Play(Base):
    id: Mapped[str]
    rally_id: Mapped[str]
    player_id: Mapped[str | None]
    action: Mapped[PlayAction]         # SERVE|PASS|SET|ATTACK|BLOCK|DIG|FREEBALL
    result: Mapped[PlayResult]         # SUCCESS|ERROR|CONTINUED
    sequence: Mapped[int]
    team: Mapped[str | None]           # "home" | "away"
    position: Mapped[str | None]
    ai_suggested: Mapped[bool] = False
    ai_confidence: Mapped[float | None]
    notes: Mapped[str | None]
```

Stats derived in `api/src/stats.py`, never stored.

**Stat derivation:**
- **Kill** = `ATTACK + SUCCESS`
- **Attack error** = `ATTACK + ERROR`
- **Dig** = `DIG + (SUCCESS | CONTINUED)`
- **Block** = `BLOCK + SUCCESS`
- **Ace** = `SERVE + SUCCESS`
- **Service error** = `SERVE + ERROR`
- **Assist** = `SET` immediately preceding a `KILL` by a teammate
- **Reception error** = `PASS + ERROR`

---

## Phases

### Phase 1 — Manual MVP (~15–25 hours dev + ~2 hours deploy)
- FastAPI scaffold with SQLAlchemy + Alembic
- Next.js scaffold
- Endpoints: seasons / teams / players / matches CRUD, rallies / plays CRUD
- Video upload: Next.js → presigned R2 URL → direct upload → register VideoAsset
- Tracker page: video player + rally panel + hotkeys + live stats
- Match summary + CSV export
- Seed script with realistic Tito's Courts demo data
- Deploy backend to `api.titoscourts.com`; frontend stays local for personal use

Shippable for personal use after this. You can track matches from your laptop at the venue.

### Phase 2 — AI rally detection
- Vendor rally-detection module from `volleyball_analytics`
- Endpoint `POST /matches/{id}/detect-rallies` runs the model on the video, returns proposed rally boundaries
- Frontend renders proposals as draft rallies; user accepts / drags edges
- Track AI-vs-human edit distance per match as quality signal

CPU-only inference: confirmed feasible (`fast-volleyball-tracking-inference` claims ~100 FPS on a similar CPU). Your VPS handles this.

### Phase 3 — AI action classification
- Vendor action recognition module (serve / receive / set / spike / block / pass)
- For each rally, run classifier on the rally clip
- Falls back to Claude Sonnet 4.5 vision for low-confidence cases (< 0.6)
- Returns `Play[]` proposals; user reviews / confirms in tracker UI
- AI plays render with draft badge and confidence score

CPU inference: ~1–3 hrs per 90-min match. Run as background job after each match. If turnaround needs to be faster, Modal's GPU is a paid fallback for this phase only.

### Phase 4 — Player identification
- **Jersey OCR is primary** (mandatory jerseys make this reliable)
- PaddleOCR reads jersey numbers and names from sampled frames
- Many Tito's jerseys carry **both name and number** — two independent signals per player
- Position-on-court is a tiebreaker
- **Lineup capture**: at start of each set, user marks rotation order (1–6 positions). Strong prior — if #7 is in position 4, the next "left front" play is probably #7
- Once lineup is set and a few jerseys confirmed, attribution should auto-confirm most plays

### Phase 5 — League dashboard + public deploy
- Cross-match aggregation
- Player leaderboards (K/E ratio, attack %, dig count, etc.)
- Team breakdowns
- **Public view at `stats.titoscourts.com`** — frontend deploys to Vercel; both subdomains now in use

### Phase 6 (stretch) — Highlights & clips
- Auto-generate highlight reel per match (kills + blocks + aces)
- Per-player clip reels (player retention / social)
- Use `fast-volleyball-tracking-inference` for ball-centered 9:16 reels (Instagram-ready)

---

## Filming requirements (league rule)

**Mandatory** for tracked matches.

### Player requirements
- **Numbered jerseys are required to play** in any tracked match. No exceptions — one missing jersey breaks attribution for the whole match.
- Numbers on the back, minimum 8 inches tall, high contrast (white-on-dark or dark-on-white).
- Each jersey number unique within a team for the season.
- Names on jerseys (where present) are a bonus — second OCR signal when numbers are occluded.
- Captains responsible for confirming jersey compliance pre-match (add to captains package).

### Camera requirements
- **Height: 6–10 ft elevated.** Tripod, bleacher, or wall mount.
- **Position: sideline mid-court**, equidistant from both end lines.
- **Framing: court fills 75–85% of the frame.** Both 10-ft lines and both end lines visible, no large dead-floor margins.
- **Locked and stable.** Tripod or mount. Panning destroys frame extraction.
- **Recording continuous** — one file per match.
- **Format: MP4 H.264, 1080p, 30fps minimum.**
- **Reference**: Etobicoke ABGs vs TL clip is close to target. Improvements: tighter framing, mid-court (not end-biased) position. Pakmen needs: more height (8–10 ft), sideline (not corner) position.

### Scoreboard overlay
- The "ABGs vs TL" overlay helps — Phase 5 can OCR it for auto-set-detection and score sanity checks.
- Keep score in same screen position across matches for reliable OCR.

---

## AI integration reference (Phase 3)

### 1. Rally clip extraction
After Phase 2 returns rally boundaries, extract clips with ffmpeg:

```python
def extract_rally_clip(video_path: str, start: float, end: float, out_path: str):
    cmd = [
        "ffmpeg", "-y", "-ss", str(start), "-i", video_path,
        "-t", str(end - start), "-c", "copy", out_path
    ]
    subprocess.run(cmd, check=True)
```

### 2. Local action classifier
Run the vendored `volleyball_analytics` classifier on the clip:

```python
from app.ml.action_recognition import ActionClassifier

classifier = ActionClassifier(weights="weights/action_v3.pt")
plays_raw = classifier.classify(clip_path)
```

### 3. Claude vision fallback for low-confidence plays
For plays where local confidence < 0.6, send a 6-frame keyframe sample to Claude using tool-use for structured output:

```python
import anthropic, base64

client = anthropic.Anthropic()

tools = [{
    "name": "record_play",
    "description": "Record one volleyball play observed in this frame sequence.",
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["SERVE","PASS","SET","ATTACK","BLOCK","DIG","FREEBALL"]},
            "result": {"type": "string", "enum": ["SUCCESS","ERROR","CONTINUED"]},
            "team": {"type": "string", "enum": ["home","away"]},
            "jersey_number": {"type": "integer", "nullable": True},
            "confidence": {"type": "number"},
            "reasoning": {"type": "string"},
        },
        "required": ["action","result","team","confidence"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=2048,
    tools=tools,
    tool_choice={"type": "tool", "name": "record_play"},
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": f"Tag this volleyball play. Home roster: {home_roster}. Away roster: {away_roster}."},
            *[
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(f).decode()}}
                for f in frame_bytes
            ],
        ],
    }],
)
```

### 4. Why tool-use over JSON-in-prompt
- Strict schema enforcement
- Model treats it as a function call → cleaner outputs
- Typed object back every time, no regex over text

### 5. Player attribution (Phase 4)
For each proposed play, run jersey OCR on the player nearest to the ball at moment of contact. Match against roster. If OCR fails → fall back to position hint + lineup prior.

### 6. Quality dashboard
Track per-match:
- **AI rally edit rate** — rallies whose boundaries the user moved
- **AI play edit rate** — plays the user changed action / result on
- **AI attribution accuracy** — player IDs the user changed

These three numbers tell you exactly where to improve.

### 7. Cost guardrails
- Self-hosted CPU inference: $0 (VPS already paid)
- Claude vision fallbacks: ~$0.05–0.20/match depending on low-confidence rate
- Optional Modal GPU burst for fast turnaround: ~$1/match
- Budget per match: $0–$2

---

## Sanity check: should you just buy this?

| Tool | What it does | Why not |
|---|---|---|
| **VolleyStation AI** | Full upload-and-go AI tagging | Pricing geared to clubs / pro; less customizable |
| **SportsVisio** | AI stat tracking app | Same |
| **Hudl Assist** | Human-in-the-loop tagging, pay per video | Expensive at league scale |
| **Balltime** | Volleyball-specific auto-stats | Targets clubs |

**Reasons to build instead:**
- **Custom for Tito's**: deep titoscourts.com integration, league-specific stats, your branding
- **Cost at scale**: VPS + R2 = ~$2/mo vs commercial tools at per-match pricing
- **Differentiation**: video-linked stats are a marketing asset for the league
- **Career signal**: shipping an AI product as a developer transitioning into security/AI is a strong portfolio piece

If none apply, buy the commercial option and move on.

---

## Open questions

1. **Single-camera assumption**: confirmed. Multi-angle is Phase 7+.
2. **Sets**: button-driven for Phase 1; OCR scoreboard for set boundary in Phase 5.
3. **Privacy**: any league rules about player likenesses on uploaded video before public dashboards launch?
4. **Storage retention**: how long to keep match videos? Affects R2 cost.
5. **Public read access on `stats.titoscourts.com`**: all players visible by name? Opt-out mechanism?
6. **Auth on `api.titoscourts.com`**: skipping for Phase 1 (your VPS, your API). Add NextAuth or API keys before public read access in Phase 5.
