# Uploading match videos

The match-upload flow is a direct browser-to-R2 PUT against a server-signed URL. It works well for files **under ~300 MB**. Raw venue recordings often run 800 MB to 2 GB at 1080p/30fps for a single 15–20 min set — those will fail mid-PUT (browser memory pressure, request timeouts, or network blips), and there's no resume.

Until we add server-side multipart upload, **compress every video on your laptop before uploading.**

---

## Recommended workflow

1. Drop the raw venue file in a local folder (anywhere — example uses `~/titos/inbox/`).
2. A watcher script (or one-shot ffmpeg invocation, below) outputs a compressed `.mp4` to a sibling `~/titos/compressed/` folder.
3. Upload the compressed file via the `/matches/new` flow in the web app.
4. Once you confirm tracking works for that match, delete the raw and the compressed local copies.

The one-shot command is enough for ad-hoc use. A watcher script is only worth writing once you're processing a full Thursday night (24 sets) in one sitting.

---

## ffmpeg command

```bash
ffmpeg -i INPUT.mp4 \
       -vcodec libx264 -crf 28 -preset fast \
       -acodec aac -b:a 128k \
       OUTPUT.mp4
```

What each flag does:

| Flag | Meaning |
| --- | --- |
| `-vcodec libx264` | H.264 video codec. Widely supported by `<video>` in every browser; same codec the venue cameras use. |
| `-crf 28` | Constant Rate Factor. Lower = higher quality + bigger file. `28` is a strong compression target for tracker use (no need for archive-grade fidelity since plays are visually obvious). |
| `-preset fast` | Encoder speed vs. compression efficiency. `fast` is a sane default on a laptop. Use `medium` for a touch more compression at 2-3× the time; `veryfast` to halve the time at the cost of ~10% larger output. |
| `-acodec aac -b:a 128k` | Audio: AAC at 128 kbps. Inaudible difference vs. the source for tracker use; keeps the audio under 1 MB/min. |

Rough expectation on a typical 1080p/30 venue file: 800 MB → 80–150 MB, encoded in 1–3 min on an M-series Mac.

---

## Size targets

| Compressed size | Behavior |
| --- | --- |
| **< 300 MB** | Reliable. Use this as your default ceiling. |
| 300–500 MB | Usually works, occasional timeouts. Acceptable if cutting again would lose quality you need. |
| > 500 MB | Expect failures. Recompress with `-crf 30` or shorter `-preset` (e.g., `-preset slow` for better compression at cost of time) before retrying. |

If a compressed file still exceeds 300 MB and you can't tighten further without visible quality loss, that's a signal the raw was unusually long (e.g., a recorded full 2-hour court block instead of a single set) — trim it first with `-ss` / `-to` before re-encoding.

---

## What this doesn't solve (yet)

This is a local workaround, not a proper fix. Three things would tighten this up if/when the manual workflow gets painful:

- **Server-side multipart upload.** The browser splits the file into 5–10 MB chunks, uploads them in parallel against R2's multipart API, and resumes from the last successful chunk on failure. Makes 1 GB+ uploads reliable without compression. Backlog.
- **Server-side post-upload transcode.** Worker picks up raw uploads, runs the same ffmpeg pass server-side, swaps the `raw` VideoAsset for the smaller version. Cleanest UX but adds infra. Phase 2+.
- **Browser-side compression via ffmpeg.wasm.** Considered and rejected — at ~10 fps encode rate on an M1, a 20-min source takes ~20 min in the browser tab. Slower than just running native ffmpeg locally.

When/if real-use volume justifies the work, multipart upload is the first thing to revisit. For now: compress locally, upload, get back to tracking.
