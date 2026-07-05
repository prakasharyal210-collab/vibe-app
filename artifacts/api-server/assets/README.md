# API Server Assets

Static assets bundled with the API server at build/deploy time.

## gundruk-logo.png (REQUIRED for watermark downloads)

The watermark endpoint (`POST /api/reels/:id/download`) overlays this PNG on
downloaded reels. The file must be present at this path on Railway — it is NOT
automatically deployed unless you add it here.

**How to set it up (pick one):**

### Option A — Copy the app icon (quickest placeholder)

```bash
cp artifacts/mobile/assets/images/icon.png \
   artifacts/api-server/assets/gundruk-logo.png
```

Commit and push. The icon is square and works fine as a watermark placeholder.

### Option B — Provide a proper logo PNG

Replace `artifacts/api-server/assets/gundruk-logo.png` with a transparent-background
PNG of your actual Gundruk wordmark or logo.

Recommended spec: transparent background, ≥ 500 px wide, PNG-24.

### Option C — Environment variable (Railway override)

Set `GUNDRUK_LOGO_PATH` on Railway to the absolute path of any PNG already on the
filesystem (e.g. if you mount a volume). This overrides the bundled asset entirely.

---

The watermark renders the logo at **18% of the reel's video width** (probe via ffprobe),
**70% opacity**, positioned **bottom-right with a 20 px margin** on each side.
