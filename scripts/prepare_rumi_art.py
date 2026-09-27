#!/usr/bin/env python3
"""把鲁米线用到的 4 张真实古画整理进 public/assets/rumi/art/（转 webp、长边 1600）。

用法：
  1. 从下表的链接下载原图，存成 public/assets/rumi/art/<name>.jpg
  2. python scripts/prepare_rumi_art.py          # 转成同名 .webp（原 jpg 不进 git）
     python scripts/prepare_rumi_art.py --download  # 也可以让脚本自己下载（博物馆服务器拒绝时就手动下）

墙签（作者、年代、馆藏号、授权）已经写在 src/data/artworks.json，图一放好游戏里就会显示。
来源都是大都会艺术博物馆开放获取（API 标明 isPublicDomain: true）。
"""
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "assets" / "rumi" / "art"
ITEMS = {
    # name: (用在哪, 原图 URL, 对象页)
    "concourse_of_birds": ("1220 百鸟会议 · 画作卡",
        "https://images.metmuseum.org/CRDImages/is/original/DP234083.jpg",
        "https://www.metmuseum.org/art/collection/search/451725"),
    "xuanzong_flight_to_shu": ("1258 中国画师 · 镜中画",
        "https://images.metmuseum.org/CRDImages/as/original/DP247676.jpg",
        "https://www.metmuseum.org/art/collection/search/40055"),
    "elephant_alam_guman": ("1258 黑屋里的大象 · 点灯之后",
        "https://images.metmuseum.org/CRDImages/is/original/DP234016.jpg",
        "https://www.metmuseum.org/art/collection/search/453367"),
    "dancing_dervishes": ("1273 婚礼之夜 · 片尾",
        "https://images.metmuseum.org/CRDImages/is/original/DP231332.jpg",
        "https://www.metmuseum.org/art/collection/search/446892"),
}
LONG_SIDE = 1600


def main():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("需要 Pillow：pip install pillow")
    ART.mkdir(parents=True, exist_ok=True)
    download = "--download" in sys.argv
    for name, (use, url, page) in ITEMS.items():
        src = ART / f"{name}.jpg"
        dst = ART / f"{name}.webp"
        if download and not src.exists():
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (history-game asset prep)"})
                src.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                print(f"↓ 下载 {src.name}")
            except Exception as e:  # noqa: BLE001
                print(f"✗ {name}: 下载失败（{e}）——请手动从 {url} 下载，存成 {src.relative_to(ROOT)}")
                continue
        if not src.exists():
            print(f"· {name}: 还没有原图。下载 {url}（对象页 {page}），存成 {src.relative_to(ROOT)} —— 用在 {use}")
            continue
        im = Image.open(src).convert("RGB")
        im.thumbnail((LONG_SIDE, LONG_SIDE))
        im.save(dst, "WEBP", quality=82, method=6)
        print(f"✓ {dst.relative_to(ROOT)}  {im.size[0]}×{im.size[1]}  {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
