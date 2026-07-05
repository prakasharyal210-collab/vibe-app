import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const router = Router();
const execAsync = promisify(exec);

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// ── Logo asset ───────────────────────────────────────────────────────────────
// No dedicated Gundruk logo PNG was found in the repo. LOGO_PATH resolves to:
//   1. GUNDRUK_LOGO_PATH env var (set this on Railway), or
//   2. artifacts/api-server/assets/gundruk-logo.png (bundled with the server).
//
// ACTION REQUIRED before first deploy:
//   cp artifacts/mobile/assets/images/icon.png \
//      artifacts/api-server/assets/gundruk-logo.png
// or place your preferred transparent-background PNG there.
const LOGO_PATH =
  process.env["GUNDRUK_LOGO_PATH"] ??
  path.join(__dirname, "../../assets/gundruk-logo.png");

const WATERMARKED_BUCKET = "reels-watermarked";
const FFMPEG_TIMEOUT_MS = 60_000; // 60 s hard cap on the ffmpeg process

// Per-reel in-memory render lock — at this scale a module-level Set is sufficient.
// Prevents two concurrent requests from double-rendering (and double-charging storage)
// for the same reel while a render is in flight.
const renderLocks = new Set<string>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { get } = url.startsWith("https")
      ? require("https")
      : require("http");
    const file = fs.createWriteStream(destPath);
    get(url, (res: NodeJS.ReadableStream) => {
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", (err: Error) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on("error", (err: Error) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS / 1000}s`),
      );
    }, FFMPEG_TIMEOUT_MS);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${stderr.slice(-600)}`,
          ),
        );
      }
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

// POST /api/reels/:id/download
// Returns { data: { url: string, cached: boolean }, error: null }
// or      { data: null, error: string } with an appropriate HTTP status.
//
// Render pipeline (cache miss):
//   1. Download source video → tmp/input.mp4
//   2. ffprobe → probe video width
//   3. ffmpeg: scale logo to 18% of video width, 70% opacity, overlay bottom-right
//      Full command built in the handler and logged at info level.
//   4. Upload output.mp4 → reels-watermarked/<reelId>.mp4
//   5. Return public URL; subsequent requests hit the cache immediately.
router.post("/:id/download", async (req, res) => {
  const reelId = req.params["id"];
  if (!reelId) {
    res.status(400).json({ data: null, error: "reelId required" });
    return;
  }

  const supabase = makeSupabase();
  const cachedKey = `${reelId}.mp4`;

  // ── 1. Cache check (reels-watermarked/<reelId>.mp4) ─────────────────────
  try {
    const { data: listing } = await supabase.storage
      .from(WATERMARKED_BUCKET)
      .list("", { search: cachedKey });
    if (listing?.find((f) => f.name === cachedKey)) {
      const { data: urlData } = supabase.storage
        .from(WATERMARKED_BUCKET)
        .getPublicUrl(cachedKey);
      req.log.info({ reelId }, "reels/download: cache hit");
      res.json({ data: { url: urlData.publicUrl, cached: true }, error: null });
      return;
    }
  } catch {
    // Bucket not yet created — fall through to render; upload will fail cleanly
    // with a descriptive error rather than throwing here.
  }

  // ── 2. Verify reel exists + creator allows downloads ─────────────────────
  const { data: reel, error: reelErr } = await supabase
    .from("reels")
    .select("id, video_url, allow_download")
    .eq("id", reelId)
    .maybeSingle();

  if (reelErr || !reel) {
    req.log.warn({ reelId, err: reelErr?.message }, "reels/download: not found");
    res.status(404).json({ data: null, error: "Reel not found" });
    return;
  }

  if (reel.allow_download === false) {
    res.status(403).json({
      data: null,
      error: "The creator has disabled downloads for this reel.",
    });
    return;
  }

  if (!reel.video_url) {
    res.status(422).json({
      data: null,
      error: "Reel has no source video to watermark.",
    });
    return;
  }

  // ── 3. Per-reel render lock ───────────────────────────────────────────────
  if (renderLocks.has(reelId)) {
    res.status(409).json({
      data: null,
      error: "This reel is already being processed — try again in a moment.",
    });
    return;
  }

  // ── 4. Logo existence guard ───────────────────────────────────────────────
  if (!fs.existsSync(LOGO_PATH)) {
    req.log.error({ logoPath: LOGO_PATH }, "reels/download: logo PNG missing");
    res.status(500).json({
      data: null,
      error: `Logo asset not found at "${LOGO_PATH}". Set GUNDRUK_LOGO_PATH or place gundruk-logo.png in artifacts/api-server/assets/.`,
    });
    return;
  }

  renderLocks.add(reelId);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "reel-wm-"));
  const inputPath = path.join(tmpDir, "input.mp4");
  const outputPath = path.join(tmpDir, "output.mp4");

  try {
    // ── 5. Download source video ─────────────────────────────────────────
    req.log.info({ reelId }, "reels/download: downloading source video");
    await downloadToFile(reel.video_url as string, inputPath);

    // ── 6. Probe video width → compute exact logo pixel width ────────────
    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${inputPath}"`,
    );
    const probeData = JSON.parse(probeOut) as {
      streams?: Array<{ codec_type: string; width?: number }>;
    };
    const videoStream = probeData.streams?.find(
      (s) => s.codec_type === "video",
    );
    const videoWidth = videoStream?.width ?? 1080;
    const logoWidth = Math.round(videoWidth * 0.18); // 18% of video width

    // ── 7. Build ffmpeg filter_complex ───────────────────────────────────
    //
    // [1:v]scale=<logoWidth>:-1          — resize logo to logoWidth px wide, keep ratio
    // ,format=rgba                        — ensure RGBA so alpha channel op works
    // ,colorchannelmixer=aa=0.7[logo]     — 70% opacity (alpha multiply)
    // [0:v][logo]overlay=W-w-20:H-h-20   — place bottom-right, 20 px from each edge
    //   W = main video width, w = logo width
    //   H = main video height, h = logo height
    const filterComplex = [
      `[1:v]scale=${logoWidth}:-1,format=rgba,colorchannelmixer=aa=0.7[logo]`,
      `[0:v][logo]overlay=W-w-20:H-h-20`,
    ].join(";");

    const ffmpegArgs = [
      "-i", inputPath,
      "-i", LOGO_PATH,
      "-filter_complex", filterComplex,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "copy",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    req.log.info(
      { reelId, videoWidth, logoWidth, cmd: `ffmpeg ${ffmpegArgs.join(" ")}` },
      "reels/download: running ffmpeg",
    );
    await runFfmpeg(ffmpegArgs);

    // ── 8. Upload to reels-watermarked bucket ────────────────────────────
    const outputBuffer = await fs.promises.readFile(outputPath);
    const { error: uploadErr } = await supabase.storage
      .from(WATERMARKED_BUCKET)
      .upload(cachedKey, outputBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(WATERMARKED_BUCKET)
      .getPublicUrl(cachedKey);

    req.log.info({ reelId }, "reels/download: render complete");
    res.json({ data: { url: urlData.publicUrl, cached: false }, error: null });
  } catch (err: any) {
    req.log.error(
      { reelId, err: err?.message },
      "reels/download: render failed",
    );
    res.status(500).json({ data: null, error: err?.message ?? "Render failed" });
  } finally {
    renderLocks.delete(reelId);
    // Always clean temp dir — success and failure both
    await fs.promises
      .rm(tmpDir, { recursive: true, force: true })
      .catch(() => {});
  }
});

export default router;
