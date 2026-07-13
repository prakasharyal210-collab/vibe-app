#!/usr/bin/env python3
"""
One-time script: backfill image_width / image_height for posts that are
missing them (all pre-July-12 uploads that predate the resize step).

Technique: HTTP Range request for the first 64 KB of each JPEG/PNG file —
enough to parse the SOF/IHDR header without downloading the full image.
Runs up to 10 concurrent requests to finish quickly.
"""
import os, json, struct, sys, urllib.request, urllib.error, concurrent.futures

SUPABASE_URL = "https://tatroqgcyebuqqkhmvpa.supabase.co"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Accept": "application/json",
    "Content-Type": "application/json",
}

# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def fetch_missing():
    url = (
        f"{SUPABASE_URL}/rest/v1/posts"
        "?select=id,image_url,media_url"
        "&image_width=is.null"
        "&order=created_at.asc"
        "&limit=500"
    )
    req = urllib.request.Request(url, headers=BASE_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        rows = json.loads(r.read())
    out = []
    for p in rows:
        raw_url = p.get("image_url") or p.get("media_url") or ""
        ext = raw_url.lower().split("?")[0].rsplit(".", 1)[-1]
        if ext in ("jpg", "jpeg", "png", "gif", "webp"):
            out.append({"id": p["id"], "url": raw_url, "ext": ext})
    return out


def patch_dimensions(post_id, w, h):
    url = f"{SUPABASE_URL}/rest/v1/posts?id=eq.{post_id}"
    body = json.dumps({"image_width": w, "image_height": h}).encode()
    hdrs = {**BASE_HEADERS, "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=body, headers=hdrs, method="PATCH")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status


# ---------------------------------------------------------------------------
# Image dimension parsers (from partial header bytes)
# ---------------------------------------------------------------------------

def fetch_partial(url, end_byte=65535):
    req = urllib.request.Request(url, headers={"Range": f"bytes=0-{end_byte}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 416:          # Range Not Satisfiable — file smaller than range
            req2 = urllib.request.Request(url)
            with urllib.request.urlopen(req2, timeout=20) as r2:
                return r2.read()
        raise


def jpeg_dimensions(data):
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 3 < len(data):
        while i < len(data) and data[i] == 0xff:
            i += 1
        if i >= len(data):
            break
        marker = data[i]; i += 1
        # Markers with no payload
        if marker in (0xd8, 0xd9, 0x01) or (0xd0 <= marker <= 0xd7):
            continue
        if i + 2 > len(data):
            break
        length = struct.unpack(">H", data[i: i + 2])[0]
        # SOF markers carry image dimensions
        if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
                       0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
            # SOF segment layout from position i (start of length field):
            #   [i+0, i+1] = 2-byte length
            #   [i+2]      = 1-byte sample precision
            #   [i+3, i+4] = 2-byte height  (big-endian)
            #   [i+5, i+6] = 2-byte width   (big-endian)
            if i + 7 <= len(data):
                h = struct.unpack(">H", data[i + 3: i + 5])[0]
                w = struct.unpack(">H", data[i + 5: i + 7])[0]
                if w > 0 and h > 0:
                    return w, h
        i += length       # advance by payload length (length field includes its 2 bytes)


def png_dimensions(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w = struct.unpack(">I", data[16:20])[0]
    h = struct.unpack(">I", data[20:24])[0]
    return (w, h) if w > 0 and h > 0 else None


def gif_dimensions(data):
    if len(data) < 10 or data[:6] not in (b"GIF87a", b"GIF89a"):
        return None
    w, h = struct.unpack("<HH", data[6:10])
    return (w, h) if w > 0 and h > 0 else None


def parse_dimensions(data, ext):
    if ext == "png":
        return png_dimensions(data)
    if ext == "gif":
        return gif_dimensions(data)
    dims = jpeg_dimensions(data)
    if dims:
        return dims
    return png_dimensions(data) or gif_dimensions(data)


# ---------------------------------------------------------------------------
# Per-post worker
# ---------------------------------------------------------------------------

def process(post):
    pid = post["id"]
    url = post["url"]
    ext = post["ext"]
    try:
        data = fetch_partial(url)
    except Exception as e:
        return pid, None, f"FETCH_ERR: {e}"

    dims = parse_dimensions(data, ext)
    if not dims:
        return pid, None, f"PARSE_FAIL (got {len(data)} bytes)"

    w, h = dims
    try:
        patch_dimensions(pid, w, h)
        return pid, (w, h), f"OK {w}x{h}"
    except Exception as e:
        return pid, None, f"PATCH_ERR: {e}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Querying posts with missing image_width / image_height …")
    posts = fetch_missing()
    print(f"Found {len(posts)} image posts to backfill\n")

    if not posts:
        print("Nothing to do.")
        return

    ok = fail = 0
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for pid, dims, status in ex.map(process, posts):
            marker = "✓" if dims else "✗"
            print(f"  {marker}  {pid[:8]}  {status}")
            results.append((pid, dims, status))
            if dims:
                ok += 1
            else:
                fail += 1

    print(f"\n{'='*55}")
    print(f"Done.  Updated: {ok}   Failed: {fail}   Total: {len(posts)}")

    if fail:
        print("\nFailed posts:")
        for pid, _, status in results:
            if _ is None:
                print(f"  {pid}  →  {status}")


main()
