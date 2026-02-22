#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Tuple

import urllib.request
import urllib.error


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "assets" / "pixel" / "style_reference.png"
OUT_DIR = ROOT / "assets" / "ui"
MODEL = "gemini-3-pro-image-preview"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


def b64_png(path: Path) -> str:
    data = path.read_bytes()
    return base64.b64encode(data).decode("ascii")


def http_post_json(url: str, api_key: str, payload: dict, timeout_s: int = 180) -> dict:
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
    candidates = resp.get("candidates") or []
    if not candidates:
        raise RuntimeError("No candidates in response.")
    content = (candidates[0].get("content") or {})
    parts = content.get("parts") or []
    for p in parts:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and inline.get("data"):
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            return base64.b64decode(inline["data"]), mime
    raise RuntimeError("No inline image data found in response parts.")


def safe_filename(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[^a-zA-Z0-9_\\-\\.]+", "_", s)
    return s


STYLE = (
    "Pixel art icon. Warm, cozy, casual mood. Soft pastel palette. Clean readable silhouette. "
    "No text, no watermark, no logo. No gore. "
    "Transparent background if possible. "
    "Match the style of the reference pixel art image."
)


SPECS = [
    ("gear_weapon", "A cute fantasy sword icon (weapon). Centered. Readable at small size."),
    ("gear_helmet", "A cute fantasy helmet icon. Centered. Readable at small size."),
    ("gear_armor", "A cute fantasy chest armor icon. Centered. Readable at small size."),
    ("gear_boots", "A cute fantasy boots icon. Centered. Readable at small size."),
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
    total = len(SPECS)

    for idx, (sid, scene) in enumerate(SPECS, start=1):
        out_path = OUT_DIR / f"{safe_filename(sid)}.png"
        if out_path.exists():
            print(f"[{idx:02d}/{total:02d}] exists: {out_path.name} (skip)")
            continue

        prompt = f"{STYLE}\n\nSubject: {scene}\n\nFraming: 1:1 square, centered icon, simple shapes."
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

        print(f"[{idx:02d}/{total:02d}] generating: {sid} ...")
        resp = http_post_json(ENDPOINT, api_key, payload, timeout_s=180)
        img_bytes, _mime = extract_first_image(resp)

        # Normalize to PNG for consistent loading in the UI.
        try:
            from PIL import Image  # type: ignore

            im = Image.open(BytesIO(img_bytes))
            # keep alpha if present
            if im.mode not in ("RGBA", "RGB"):
                im = im.convert("RGBA")
            if im.mode == "RGB":
                im = im.convert("RGBA")
            im.save(out_path, format="PNG", optimize=True)
            wrote = out_path
            print(f"  -> wrote {wrote.relative_to(ROOT)} ({wrote.stat().st_size} bytes)")
        except Exception:
            out_path.write_bytes(img_bytes)
            print(f"  -> wrote {out_path.relative_to(ROOT)} ({len(img_bytes)} bytes, raw)")

        time.sleep(0.4)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

