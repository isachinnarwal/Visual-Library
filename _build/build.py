#!/usr/bin/env python3
"""
Build the static Visual Library site.

Reads the untouched library at ../..  (INDEX.json + <category>/<id>/{manifest,template,preview})
and produces a fully self-contained, deployable folder in ../ :

    webapp/
      index.html            hand-written, no build step needed at deploy time
      assets/               app.js, styles.css
      data/library.json     visuals + facets, the static twin of /api/visual-library
      library/<cat>/<id>/   template.html, preview.png, thumb.webp

Nothing outside webapp/ is ever written to. Re-run after adding templates:

    python webapp/_build/build.py
"""

from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from datetime import date
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("Pillow is required:  pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

WEBAPP = Path(__file__).resolve().parent.parent
LIBRARY_ROOT = WEBAPP.parent
INDEX_PATH = LIBRARY_ROOT / "INDEX.json"

OUT_LIBRARY = WEBAPP / "library"
OUT_DATA = WEBAPP / "data"

THUMB_WIDTH = 800
THUMB_QUALITY = 80


def human(n: int) -> str:
    return f"{n / 1048576:.1f} MB"


def build_thumb(src: Path, dest: Path) -> None:
    """Downscale preview.png to a grid-sized WebP. Skips work if already current."""
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return
    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        if w > THUMB_WIDTH:
            im = im.resize((THUMB_WIDTH, round(h * THUMB_WIDTH / w)), Image.LANCZOS)
        im.save(dest, "WEBP", quality=THUMB_QUALITY, method=6)


def copy_if_newer(src: Path, dest: Path) -> None:
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime and dest.stat().st_size == src.stat().st_size:
        return
    shutil.copy2(src, dest)


def main() -> int:
    if not INDEX_PATH.exists():
        print(f"INDEX.json not found at {INDEX_PATH}", file=sys.stderr)
        return 1

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    OUT_LIBRARY.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)

    visuals: list[dict] = []
    skipped: list[str] = []
    bytes_out = 0

    for entry in index:
        vid, category = entry.get("id"), entry.get("category")
        if not vid or not category:
            skipped.append(f"{entry!r} (missing id/category)")
            continue

        src_dir = LIBRARY_ROOT / category / vid
        template_src = src_dir / "template.html"
        preview_src = src_dir / "preview.png"
        manifest_src = src_dir / "manifest.json"

        if not template_src.exists():
            skipped.append(f"{vid} (no template.html)")
            continue

        dest_dir = OUT_LIBRARY / category / vid
        dest_dir.mkdir(parents=True, exist_ok=True)

        copy_if_newer(template_src, dest_dir / "template.html")

        has_preview = preview_src.exists()
        if has_preview:
            copy_if_newer(preview_src, dest_dir / "preview.png")
            build_thumb(preview_src, dest_dir / "thumb.webp")

        # Manifest fields the card/dialog needs without a server. `canvas` matters:
        # templates are a fixed pixel stage (1920x1080), so the preview iframe has
        # to be rendered at that size and scaled down to fit, or it gets cropped.
        notes = duration = None
        canvas = {"width": 1920, "height": 1080}
        if manifest_src.exists():
            try:
                m = json.loads(manifest_src.read_text(encoding="utf-8"))
                notes = m.get("notes")
                duration = m.get("duration_seconds")
                c = m.get("canvas") or {}
                if c.get("width") and c.get("height"):
                    canvas = {"width": int(c["width"]), "height": int(c["height"])}
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        if entry.get("aspect") == "9:16" and canvas["width"] > canvas["height"]:
            canvas = {"width": canvas["height"], "height": canvas["width"]}

        rel = f"library/{category}/{vid}"
        visuals.append(
            {
                **entry,
                "duration_seconds": entry.get("duration_seconds", duration),
                "notes": notes,
                "canvas": canvas,
                "hasPreview": has_preview,
                "hasTemplate": True,
                "previewUrl": f"{rel}/preview.png" if has_preview else None,
                "thumbUrl": f"{rel}/thumb.webp" if has_preview else None,
                "templateUrl": f"{rel}/template.html",
            }
        )
        bytes_out += sum(f.stat().st_size for f in dest_dir.iterdir() if f.is_file())

    # Facets — same shape and ordering rules as lib/visual-library.js listFacets()
    categories = sorted({v["category"] for v in visuals if v.get("category")})
    aspects = sorted({v["aspect"] for v in visuals if v.get("aspect")})
    tag_counts = Counter(t for v in visuals for t in (v.get("tags") or []))
    tags = [{"tag": t, "count": c} for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))]

    payload = {
        "generated": date.today().isoformat(),
        "visuals": visuals,
        "facets": {"categories": categories, "aspects": aspects, "tags": tags, "total": len(visuals)},
    }
    (OUT_DATA / "library.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Prune anything left over from a previous build so the deploy stays clean.
    # Category paths vary in depth ("timelines" vs "infographics/2-point"), so keep
    # every entry dir *and* each of its ancestors, then delete the rest top-down.
    keep: set[Path] = set()
    for v in visuals:
        d = OUT_LIBRARY / v["category"] / v["id"]
        while d != OUT_LIBRARY:
            keep.add(d)
            d = d.parent

    for d in sorted((p for p in OUT_LIBRARY.rglob("*") if p.is_dir()), key=lambda p: len(p.parts)):
        if not d.exists():
            continue  # already removed with its parent
        if d not in keep:
            shutil.rmtree(d)
            print(f"  pruned stale entry: {d.relative_to(OUT_LIBRARY)}")

    print(f"Built {len(visuals)} visuals across {len(categories)} categories.")
    print(f"  data/library.json   {len(tags)} distinct tags")
    print(f"  library/            {human(bytes_out)}")
    if skipped:
        print(f"  skipped {len(skipped)}:")
        for s in skipped:
            print(f"    - {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
