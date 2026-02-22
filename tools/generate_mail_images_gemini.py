#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

import urllib.request
import urllib.error


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "assets" / "reference" / "son_refer.png"
OUT_DIR = ROOT / "assets" / "mail"
MODEL = "gemini-3-pro-image-preview"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v
    except Exception:
        return


def b64_png(path: Path) -> str:
    data = path.read_bytes()
    return base64.b64encode(data).decode("ascii")


def http_post_json(url: str, api_key: str, payload: dict, timeout_s: int = 120) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {raw}") from e


def extract_first_image(resp: dict) -> Tuple[bytes, str]:
    """
    Returns (image_bytes, mime_type).
    Gemini responses may use inlineData or inline_data depending on client/version.
    """
    candidates = resp.get("candidates") or []
    if not candidates:
        raise RuntimeError("No candidates in response.")
    content = (candidates[0].get("content") or {})
    parts = content.get("parts") or []
    for p in parts:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and inline.get("data"):
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            data_b64 = inline["data"]
            return base64.b64decode(data_b64), mime
    raise RuntimeError("No inline image data found in response parts.")


def ext_from_mime(mime: str) -> str:
    m = (mime or "").lower()
    if "png" in m:
        return ".png"
    if "webp" in m:
        return ".webp"
    if "jpeg" in m or "jpg" in m:
        return ".jpg"
    return ".bin"


def safe_filename(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[^a-zA-Z0-9_\\-\\.]+", "_", s)
    return s


STYLE = (
    "Warm, casual, sentimental illustration. Soft pastel colors, gentle lighting, cozy mood. "
    "Simple shapes and clean lines, cute and friendly. "
    "Match the boy character design from the reference image (same face/hair/clothes vibe). "
    "No text, no watermark, no logo. Non-violent, no gore."
)


SPECS = [
    ("mail01_goblin", "The boy proudly shows a small cute goblin plush/toy he found, forest background, friendly vibe."),
    ("mail02_camp", "The boy sitting near a small campfire under a starry sky, holding a warm mug, calm smile."),
    ("mail03_relic", "The boy holding a softly glowing relic fragment in ruined temple corridor, wonder and awe."),
    ("mail04_kindness", "The boy gently helping a small injured animal with a bandage, meadow flowers around."),
    ("mail05_mountain", "The boy on a windy mountain ridge, scarf fluttering, looking at the sky, warm sunlight."),
    ("mail06_guardian", "The boy looking determined in front of an ancient stone guardian (not scary), warm ruins scene."),
    ("mail07_soup", "The boy holding a bowl of warm soup, cozy travel moment, forest clearing."),
    ("mail08_wolf", "The boy meeting a friendly wolf companion, peaceful moment, forest path."),
    ("mail09_smile", "Close-up portrait of the boy smiling warmly, holding a small heart-shaped charm, soft background."),
    ("mail10_dragon", "The boy seeing a distant dragon silhouette on the horizon (majestic, not terrifying), warm twilight."),
]


def main() -> int:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("Missing GEMINI_API_KEY. Fill it in .env or export it, then re-run.", file=sys.stderr)
        return 2

    if not REFERENCE.exists():
        print(f"Reference image not found: {REFERENCE}", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ref_b64 = b64_png(REFERENCE)

    for idx, (sid, scene) in enumerate(SPECS, start=1):
        out_base = OUT_DIR / f"{safe_filename(sid)}"
        existing = list(OUT_DIR.glob(f"{out_base.name}.*"))
        if existing:
            # Keep deterministic outputs unless user wants regeneration.
            print(f"[{idx:02d}/10] exists: {existing[0].name} (skip)")
            continue

        prompt = f"{STYLE}\n\nScene: {scene}\n\nFraming: 1:1 square, centered character, cozy background."
        payload = {
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": "image/png", "data": ref_b64}},
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {
                "responseModalities": ["IMAGE", "TEXT"],
            },
        }

        print(f"[{idx:02d}/10] generating: {sid} ...")
        resp = http_post_json(ENDPOINT, api_key, payload, timeout_s=180)
        img_bytes, mime = extract_first_image(resp)
        ext = ext_from_mime(mime)
        out_path = OUT_DIR / f"{out_base.name}{ext}"
        out_path.write_bytes(img_bytes)
        print(f"  -> wrote {out_path.relative_to(ROOT)} ({mime}, {len(img_bytes)} bytes)")
        time.sleep(0.5)  # gentle pacing to avoid rate limits

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

