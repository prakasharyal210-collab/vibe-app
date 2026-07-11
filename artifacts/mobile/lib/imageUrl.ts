/**
 * Supabase Storage image transformation helper.
 *
 * All Gundruk media buckets (posts, reels, avatars, media) are created with
 * `public: true` (see api-server `src/index.ts` / `routes/admin/setup.ts`),
 * so every stored image URL looks like:
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * Supabase's on-the-fly image transformation (Pro plan+) is served from a
 * sibling `render/image` endpoint instead of `object`:
 *   https://<project>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=W&height=H&resize=MODE&quality=Q
 *
 * This helper rewrites an existing public object URL into its transformed
 * render-image equivalent. It is a pure string transform — no upload/storage
 * changes, no API server involvement, fully OTA-deployable.
 *
 * Falls back to the original, untouched URL for anything that isn't a
 * recognizable Supabase public storage URL (e.g. picsum placeholders, or a
 * private signed URL from createSignedUrl — those already carry a `?token=`
 * and must not be rewritten).
 */

export type ImageSizePreset = "thumbnail" | "card" | "full";

const PRESETS: Record<Exclude<ImageSizePreset, "full">, { width: number; height: number; quality: number; resize: "cover" | "contain" | "fill" }> = {
  // Grid cells (profile grid, hashtag/location/sounds grids) render at a
  // small fixed square — GRID_ITEM is screen-width/3, ~120-140px @1x,
  // up to ~280px @2x on the densest phones. 200px covers that with margin.
  // resize=cover is intentional here: thumbnails are always displayed as squares
  // and we want the server to do the square crop so the file is exactly 200×200.
  thumbnail: { width: 200, height: 200, quality: 65, resize: "cover" },

  // Feed post cards and reel thumbnails render close to full device width
  // (CARD_W, ~380-430px logical) but at up to 3x pixel density on high-end
  // phones, so 800px keeps them crisp without ever shipping the original
  // 2500px+ upload.
  //
  // IMPORTANT: resize=contain (NOT cover) — preserve the natural aspect ratio
  // in the returned image file so onLoad reports correct dimensions.
  // Client-side contentFit="cover" handles cropping to fill the container.
  // Using resize=cover here would force a 800×800 square crop server-side,
  // making onLoad always report 1:1 and overwrite the real aspect ratio in
  // the module-level ratio cache — causing spurious LayoutAnimation resizes
  // inside the FlatList and the resulting black-frame glitch.
  card: { width: 800, height: 800, quality: 75, resize: "contain" },
};

const OBJECT_PATH_MARKER = "/storage/v1/object/public/";
const RENDER_PATH_MARKER = "/storage/v1/render/image/public/";

/**
 * Returns a resized/compressed variant of a Supabase public storage URL for
 * the given preset. Pass `preset: "full"` (or omit) to get the original URL
 * back untouched — use that for the fullscreen photo viewer and story viewer
 * where the original resolution is wanted.
 */
export function getTransformedImageUrl(
  url: string | null | undefined,
  preset: ImageSizePreset = "full"
): string | undefined {
  if (!url) return url ?? undefined;
  if (preset === "full") return url;
  if (!url.includes(OBJECT_PATH_MARKER)) return url; // not a Supabase public object URL — leave as-is

  const { width, height, quality, resize } = PRESETS[preset];
  const rewritten = url.replace(OBJECT_PATH_MARKER, RENDER_PATH_MARKER);
  const separator = rewritten.includes("?") ? "&" : "?";
  return `${rewritten}${separator}width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
}

/** Convenience wrappers for the two common call sites. */
export const thumbUrl = (url: string | null | undefined) => getTransformedImageUrl(url, "thumbnail");
export const cardUrl = (url: string | null | undefined) => getTransformedImageUrl(url, "card");
