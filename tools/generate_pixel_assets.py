#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional


API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _b64_file(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _post_json(url: str, api_key: str, payload: dict, timeout_s: int) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            # Prefer header key (avoid putting secrets in URL logs)
            "x-goog-api-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}") from e


def _extract_first_image_b64(resp: dict) -> Optional[str]:
    candidates = resp.get("candidates") or []
    for cand in candidates:
        parts = (cand.get("content") or {}).get("parts") or []
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return inline["data"]
    return None


def build_prompt(style_lines: list[str], asset_prompt: str) -> str:
    style = "\n".join(f"- {line}" for line in style_lines if line.strip())
    return f"""다음 조건을 엄격히 지켜서 이미지 1장을 생성해줘.

[스타일 가이드]
{style}

[생성 대상]
{asset_prompt}
""".strip()


def generate_asset(
    *,
    model: str,
    api_key: str,
    image_size: str,
    aspect_ratio: str,
    prompt: str,
    style_ref_png: Optional[Path],
    timeout_s: int,
) -> bytes:
    parts: list[dict] = [{"text": prompt}]
    if style_ref_png and style_ref_png.exists():
        parts.append(
            {
                "inlineData": {
                    "mimeType": "image/png",
                    "data": _b64_file(style_ref_png),
                }
            }
        )

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "imageSize": image_size,
                "aspectRatio": aspect_ratio,
            },
        },
    }

    url = API_URL_TEMPLATE.format(model=model)
    resp = _post_json(url, api_key, payload, timeout_s)
    image_b64 = _extract_first_image_b64(resp)
    if not image_b64:
        raise RuntimeError(f"이미지 데이터가 없습니다. 응답: {json.dumps(resp, ensure_ascii=False)[:800]}")
    return base64.b64decode(image_b64)


def main() -> int:
    parser = argparse.ArgumentParser(description="Gemini로 픽셀 아트 에셋 생성")
    parser.add_argument("--manifest", default="tools/pixel_assets.json", help="에셋 매니페스트 JSON 경로")
    parser.add_argument("--outdir", default="assets/pixel", help="출력 폴더 (PNG 저장)")
    parser.add_argument("--style-ref", default="", help="스타일 레퍼런스 PNG (선택)")
    parser.add_argument("--only", default="", help="생성할 id만 콤마로 지정 (예: bed,son_idle)")
    parser.add_argument("--force", action="store_true", help="이미 존재하는 파일도 덮어쓰기")
    parser.add_argument("--timeout", type=int, default=180, help="요청 타임아웃(초)")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("ERROR: GEMINI_API_KEY 환경변수가 없습니다. (.env.example 참고)", file=sys.stderr)
        return 2

    manifest_path = Path(args.manifest)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    style_ref: Optional[Path] = Path(args.style_ref) if args.style_ref else None

    manifest = _read_json(manifest_path)
    model = manifest.get("model", "gemini-3-pro-image-preview")
    image_size = manifest.get("imageSize", "1K")
    style_lines = (manifest.get("style") or {}).get("text") or []
    assets = manifest.get("assets") or []

    only_ids = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None

    for asset in assets:
        asset_id = asset["id"]
        if only_ids is not None and asset_id not in only_ids:
            continue

        out_path = outdir / asset["out"]
        if out_path.exists() and not args.force:
            print(f"SKIP  {asset_id} -> {out_path} (이미 존재)")
            continue

        aspect_ratio = asset.get("aspectRatio", "1:1")
        asset_prompt = build_prompt(style_lines, asset["prompt"])
        if style_ref and style_ref.exists():
            asset_prompt = asset_prompt + "\n\n[추가 조건]\n- 첨부된 레퍼런스 이미지와 동일한 화풍/팔레트/명암 규칙을 최대한 따라줘."

        print(f"MAKE  {asset_id} -> {out_path}")
        png_bytes = generate_asset(
            model=model,
            api_key=api_key,
            image_size=image_size,
            aspect_ratio=aspect_ratio,
            prompt=asset_prompt,
            style_ref_png=style_ref,
            timeout_s=args.timeout,
        )
        out_path.write_bytes(png_bytes)
        time.sleep(0.3)  # 약간의 간격(레이트리밋 완화)

    print("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
