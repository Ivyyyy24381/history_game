#!/usr/bin/env python3
"""把试玩页要内嵌的图片缩一版，供 build_artifact.mjs 使用。

单文件 artifact 把图片内嵌成 base64 data URI，base64 本身还要再胀 33%。
正式资产是 1920×1080 / 768×1280，直接内嵌会让试玩页冲到十几 MB——发不出去，
手机上也打不开。这里按长边缩到 1280（立绘 880）再存一份，只给试玩页用；
public/ 下的正式资产不动。

    python scripts/shrink_artifact_assets.py            # 默认鲁米线
    python scripts/build_artifact.mjs 跑之前先跑这个     # npm run artifact:rumi 已经串好

产出：.artifact-assets/<原路径>，build_artifact.mjs 找得到就优先用它。
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / ".artifact-assets"

# 长边上限：背景/地图按 1280，立绘和道具按 880（它们在画面里本来就不占满）。
LIMIT_BG = 1280
LIMIT_FIGURE = 880
FIGURE_HINT = re.compile(r"/(hero|npcs|props)/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("line", nargs="?", default="rumi")
    args = ap.parse_args()

    ev_dir = ROOT / "src" / "data" / args.line / "events"
    if not ev_dir.is_dir():
        sys.exit(f"没有这条线的事件目录：{ev_dir}")

    paths = set()
    for f in ev_dir.glob("*/event.json"):
        paths.update(re.findall(r'"(/assets/[^"]+)"', f.read_text(encoding="utf-8")))

    before = after = 0
    n = skipped = 0
    for p in sorted(paths):
        src = ROOT / "public" / p.lstrip("/")
        if not src.exists():
            print(f"  ! 缺图：{p}")
            continue
        before += src.stat().st_size
        if src.suffix.lower() == ".svg":          # 矢量图原样复制
            dst = OUT_DIR / p.lstrip("/")
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())
            after += dst.stat().st_size
            skipped += 1
            continue
        limit = LIMIT_FIGURE if FIGURE_HINT.search(p) else LIMIT_BG
        im = Image.open(src)
        if max(im.size) > limit:
            im.thumbnail((limit, limit), Image.LANCZOS)
        dst = (OUT_DIR / p.lstrip("/")).with_suffix(".webp")
        dst.parent.mkdir(parents=True, exist_ok=True)
        if im.mode in ("RGBA", "LA"):
            im.save(dst, "WEBP", quality=80, method=6)
        else:
            im.convert("RGB").save(dst, "WEBP", quality=76, method=6)
        after += dst.stat().st_size
        n += 1

    print(f"[artifact] {n} 张缩图 + {skipped} 张原样："
          f"{before / 1e6:.1f} MB → {after / 1e6:.1f} MB  →  {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
