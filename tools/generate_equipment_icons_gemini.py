#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import List, Tuple

import urllib.request
import urllib.error


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "assets" / "pixel" / "style_reference.png"
OUT_DIR = ROOT / "assets" / "items"
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
    return base64.b64encode(path.read_bytes()).decode("ascii")


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


def extract_first_image(resp: dict) -> bytes:
    candidates = resp.get("candidates") or []
    if not candidates:
        raise RuntimeError("No candidates in response.")
    content = (candidates[0].get("content") or {})
    parts = content.get("parts") or []
    for p in parts:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])
    raise RuntimeError("No inline image data found in response parts.")


def safe_filename(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[^a-zA-Z0-9_\\-\\.]+", "_", s)
    return s


STYLE = (
    "Pixel art item icon. Warm, cozy, casual, sentimental mood. Soft pastel palette. "
    "Clean readable silhouette. Centered. Simple shapes. "
    "No text, no watermark, no logo. No gore. "
    "Transparent background if possible. "
    "Match the style of the reference pixel art image."
)


def gear_desc(slot: str, tier: int) -> str:
    if tier <= 3:
        theme = "wolf fang and leather"
        accent = "warm brown leather, small fang motif"
    elif tier <= 6:
        theme = "ancient ruins and runes"
        accent = "stone rune, steel, soft blue glow"
    elif tier <= 9:
        theme = "wyvern scale"
        accent = "blue-green scales, wind vibe"
    else:
        theme = "dragon heart"
        accent = "red-gold accent, legendary aura"
    part = "helmet" if slot == "helmet" else "chest armor" if slot == "armor" else "boots"
    return f"{part} icon, theme: {theme}, accent: {accent}, tier {tier} (looks stronger)."


def specs() -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    # Tier weapons (gacha)
    out += [
        ("weapon_C", "a small wooden club or simple wooden sword (starter weapon)."),
        ("weapon_B", "a steel dagger (sleek but friendly)."),
        ("weapon_A", "a knight longsword with a small guard (heroic, not scary)."),
        ("weapon_S", "a dragon slayer sword with warm golden glow (legendary)."),
    ]
    # Special (milestone) weapons
    out += [
        ("wolf_sword", "a sword with wolf fang motif (cute but cool)."),
        ("relic_sword", "an ancient relic sword with rune patterns (soft blue glow)."),
        ("dragon_sword", "a legendary dragon sword with red core gem (warm glow)."),
    ]
    # Starter gear items (legacy)
    out += [
        ("leather_helmet", "a simple leather helmet icon."),
        ("leather_armor", "a simple leather armor icon."),
        ("leather_boots", "simple leather boots icon."),
    ]
    # Craft gear tiers
    for slot in ("helmet", "armor", "boots"):
        for tier in range(1, 11):
            out.append((f"{slot}_t{tier}", gear_desc(slot, tier)))
    return out


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
    items = specs()
    total = len(items)

    try:
        from PIL import Image  # type: ignore
    except Exception as e:
        print("Missing pillow. Install with: python3 -m pip install --user pillow", file=sys.stderr)
        return 2

    target = (256, 256)

    for idx, (item_id, desc) in enumerate(items, start=1):
        out_path = OUT_DIR / f"{safe_filename(item_id)}.png"
        if out_path.exists():
            print(f"[{idx:02d}/{total:02d}] exists: {out_path.name} (skip)")
            continue

        prompt = f"{STYLE}\n\nItem: {desc}\n\nFraming: 1:1 square, centered icon, plain background."
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

        print(f"[{idx:02d}/{total:02d}] generating: {item_id} ...")
        resp = http_post_json(ENDPOINT, api_key, payload, timeout_s=180)
        img_bytes = extract_first_image(resp)

        im = Image.open(BytesIO(img_bytes))
        if im.mode not in ("RGBA", "RGB"):
            im = im.convert("RGBA")
        if im.mode == "RGB":
            im = im.convert("RGBA")
        if im.size != target:
            im = im.resize(target, resample=Image.NEAREST)
        im.save(out_path, format="PNG", optimize=True)
        print(f"  -> wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size} bytes)")

        time.sleep(0.4)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

