#!/usr/bin/env python3
"""按 rumi_geo.py 的坐标画鲁米线的地图（总图 + 4 张路线图）。

为什么不生成：AI 地图画到哪算哪，而且必出乱码地名；换一次图，图钉和途经点
就要重标一次（AUDIT.md 里踩过）。代码画的地图和坐标是同一份数据，永远对得上，
改剧本也只要改一行。画风对齐细密画：羊皮纸底、青金石蓝的海、朱砂线的路、
一排排小山。地名一律不画，由游戏 UI 叠。

    python scripts/make_rumi_maps.py

产出（webp，1920×1080）：
    public/assets/rumi/maps/rumi_general_map.webp
    public/assets/rumi/maps/route_1219_khorasan.webp
    public/assets/rumi/maps/route_1221_hajj.webp
    public/assets/rumi/maps/route_1233_syria.webp
    public/assets/rumi/maps/route_1247_damascus.webp
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rumi_geo import CITIES, RANGES, RIVERS, SEAS, city_xy, to_xy  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "rumi" / "maps"

W, H = 1920, 1080
SS = 2                      # 超采样倍数，画完再缩回去
PW, PH = W * SS, H * SS

# 取自全线画风：青金石蓝、绿松石、朱砂、赭石、金。
PARCHMENT = (232, 216, 184)
PARCH_DARK = (205, 184, 146)
SEA_DEEP = (37, 63, 112)        # 青金石
SEA_SHALLOW = (74, 132, 150)    # 近岸偏绿松石
SEA_EDGE = (26, 44, 82)
SHORE = (238, 226, 196)         # 岸边一圈浅色，像纸被水洇出来的边
RIVER = (64, 106, 150)
MOUNT_LIGHT = (198, 158, 104)
MOUNT_MID = (163, 121, 74)
MOUNT_DARK = (118, 84, 52)
ROUTE = (172, 52, 38)           # 朱砂
GOLD = (186, 150, 82)
PIN_SPOT = (86, 64, 40)


def px(lat, lon):
    x, y = to_xy(lat, lon)
    return x / 100 * PW, y / 100 * PH


def jitter_poly(pts, amp=5, seed=0):
    """给多边形加一点手绘的抖动，免得看上去像矢量图。"""
    rnd = random.Random(seed)
    return [(x + rnd.uniform(-amp, amp) * SS, y + rnd.uniform(-amp, amp) * SS) for x, y in pts]


def smooth(pts, closed=True, steps=14):
    """Catmull-Rom 插值。粗轮廓只给十来个点，直接连是硬折线，插完才像海岸。"""
    n = len(pts)
    if n < 3:
        return pts
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1 = pts[i % n]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


def parchment_base():
    """羊皮纸：大块色斑压模糊 + 一层细颗粒，免得看上去像 PPT 渐变。"""
    im = Image.new("RGB", (PW, PH), PARCHMENT)
    d = ImageDraw.Draw(im)
    rnd = random.Random(7)
    for _ in range(700):
        x, y = rnd.randrange(PW), rnd.randrange(PH)
        r = rnd.randrange(40 * SS, 200 * SS)
        d.ellipse([x - r, y - r, x + r, y + r],
                  fill=rnd.choice([PARCH_DARK, (241, 229, 203), (219, 201, 166)]))
    im = im.filter(ImageFilter.GaussianBlur(30 * SS))

    grain = Image.new("L", (PW // 2, PH // 2))
    grain.putdata([random.Random(i * 9781).randrange(120, 180) for i in range(grain.width * grain.height)])
    grain = grain.resize((PW, PH), Image.BILINEAR).filter(ImageFilter.GaussianBlur(SS * 0.6))
    im = Image.blend(im, Image.merge("RGB", (grain, grain, grain)), 0.10)

    vig = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(vig).ellipse([-PW * 0.20, -PH * 0.34, PW * 1.20, PH * 1.34], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(130 * SS))
    im = Image.composite(im, Image.blend(im, Image.new("RGB", (PW, PH), (152, 128, 94)), 0.5), vig)
    return im


def push_out(pts, pad=1.6):
    """贴着图边的点往图外推一点。

    Catmull-Rom 在首尾相接处会过冲；轮廓正好沿着图边走时，那个过冲会在画面里
    甩出一个圈。把边上的点推到画面外，过冲也就跟着出去了。"""
    from rumi_geo import LAT0, LAT1, LON0, LON1
    out = []
    for lat, lon in pts:
        if lat >= LAT1 - 0.01:
            lat = LAT1 + pad
        if lat <= LAT0 + 0.01:
            lat = LAT0 - pad
        if lon <= LON0 + 0.01:
            lon = LON0 - pad
        if lon >= LON1 - 0.01:
            lon = LON1 + pad
        out.append((lat, lon))
    return out


def sea_polys():
    """每片海的平滑轮廓，画和遮罩共用同一份。"""
    out = []
    for i, (name, pts) in enumerate(SEAS.items()):
        raw = jitter_poly([px(lat, lon) for lat, lon in push_out(pts)], amp=3, seed=i * 13 + 1)
        out.append((name, smooth(raw, closed=True, steps=16)))
    return out


def draw_seas(im):
    polys = sea_polys()

    # 岸边先铺一圈浅色，像纸被水洇开——海和陆之间有个过渡，不然像贴上去的色块
    shore = Image.new("L", (PW, PH), 0)
    sd = ImageDraw.Draw(shore)
    for _, poly in polys:
        sd.polygon(poly, fill=255)
    halo = shore.filter(ImageFilter.GaussianBlur(11 * SS))
    im.paste(Image.new("RGB", (PW, PH), SHORE), (0, 0),
             Image.eval(halo, lambda v: int(v * 0.55)))

    # 海本体：先近岸的绿松石，再往里压一层青金石
    sea = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    sdd = ImageDraw.Draw(sea)
    for _, poly in polys:
        sdd.polygon(poly, fill=SEA_SHALLOW + (255,))
    inner = Image.new("L", (PW, PH), 0)
    idd = ImageDraw.Draw(inner)
    for _, poly in polys:
        idd.polygon(poly, fill=255)
    inner = inner.filter(ImageFilter.GaussianBlur(16 * SS))
    inner = Image.eval(inner, lambda v: 255 if v > 245 else 0)
    inner = inner.filter(ImageFilter.GaussianBlur(9 * SS))
    deep = Image.new("RGBA", (PW, PH), SEA_DEEP + (255,))
    sea = Image.composite(deep, sea, inner)

    # 水纹：细密画画水就是一道道短横线
    wd = ImageDraw.Draw(sea)
    rnd = random.Random(3)
    for y in range(0, PH, 13 * SS):
        for _ in range(4):
            x0 = rnd.randrange(PW)
            wd.line([(x0, y), (x0 + rnd.randrange(30, 150) * SS, y)],
                    fill=(196, 222, 232, 58), width=SS)

    mask = Image.new("L", (PW, PH), 0)
    md = ImageDraw.Draw(mask)
    for _, poly in polys:
        md.polygon(poly, fill=255)
    im.paste(sea.convert("RGB"), (0, 0), mask)

    # 岸线：深一号的细线。画在单独一层上再按海的遮罩贴回去——
    # 样条在图边会过冲，甩出来的那一段正好被遮罩挡掉。
    edge = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    for _, poly in polys:
        ed.line(poly + [poly[0]], fill=SEA_EDGE + (215,), width=3 * SS, joint="curve")
    im.paste(edge.convert("RGB"), (0, 0),
             Image.composite(edge.split()[3], Image.new("L", (PW, PH), 0), mask))
    return im


def draw_rivers(im):
    d = ImageDraw.Draw(im, "RGBA")
    for i, line in enumerate(RIVERS):
        raw = jitter_poly([px(lat, lon) for lat, lon in line], amp=5, seed=100 + i)
        pts = smooth(raw, closed=False, steps=12)
        d.line(pts, fill=(250, 240, 214, 150), width=7 * SS, joint="curve")   # 河两侧的浅边
        d.line(pts, fill=RIVER + (235,), width=3 * SS, joint="curve")
    return im


def draw_ranges(im):
    """沿控制点插值，一路盖小山。每座山有亮面暗面，大小色相都抖一下。"""
    d = ImageDraw.Draw(im, "RGBA")
    for ri, (name, ctrl) in enumerate(RANGES):
        raw = [px(lat, lon) for lat, lon in ctrl]
        line = smooth(raw, closed=False, steps=10) if len(raw) > 2 else raw
        rnd = random.Random(200 + ri)
        dense = []
        for (x0, y0), (x1, y1) in zip(line, line[1:]):
            seg = math.hypot(x1 - x0, y1 - y0)
            n = max(1, int(seg / (20 * SS)))
            for k in range(n):
                t = k / n
                dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
        dense.append(line[-1])
        # 从后往前画，后面的山被前面的压住，有层次
        for (x, y) in sorted(dense, key=lambda q: q[1]):
            w = rnd.uniform(15, 25) * SS
            h = rnd.uniform(14, 24) * SS
            x += rnd.uniform(-7, 7) * SS
            y += rnd.uniform(-9, 9) * SS
            k = rnd.uniform(-14, 14)
            light = tuple(max(0, min(255, int(c + k))) for c in MOUNT_LIGHT)
            mid = tuple(max(0, min(255, int(c + k))) for c in MOUNT_MID)
            d.polygon([(x - w, y), (x, y - h), (x + w * 0.15, y)], fill=light + (240,))
            d.polygon([(x, y - h), (x + w, y), (x + w * 0.15, y)], fill=mid + (240,))
            d.line([(x - w, y), (x, y - h), (x + w, y)], fill=MOUNT_DARK + (180,), width=max(1, SS))
    return im


def draw_border(im):
    """抄本式的金色内框：细—粗—细三道，四角各点一个小方块。"""
    d = ImageDraw.Draw(im, "RGBA")
    for inset, w, a in ((16, 2, 200), (26, 5, 235), (40, 1, 170)):
        i = inset * SS
        d.rectangle([i, i, PW - i, PH - i], outline=GOLD + (a,), width=w * SS)
    c = 26 * SS
    for cx, cy in ((c, c), (PW - c, c), (c, PH - c), (PW - c, PH - c)):
        r = 7 * SS
        d.rectangle([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (235,))
    return im


def base_map():
    im = parchment_base()
    im = draw_seas(im)
    im = draw_rivers(im)
    im = draw_ranges(im)
    im = draw_border(im)
    return im


def dot(d, x, y, r, fill, outline=None, width=3):
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill,
              outline=outline, width=width * SS if outline else 0)


def draw_route(im, names, highlight_last=True):
    """城市之间画一条朱砂虚线，每座城一个点。names 是 rumi_geo.CITIES 的键。"""
    d = ImageDraw.Draw(im, "RGBA")
    pts = []
    for n in names:
        lat, lon = CITIES[n]
        pts.append(px(lat, lon))
    # 虚线：按固定步长在折线上打点
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        n_dash = max(2, int(seg / (16 * SS)))
        for k in range(n_dash):
            t0 = k / n_dash
            t1 = min(1.0, t0 + 0.55 / n_dash)
            a = (x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0)
            b = (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)
            d.line([a, b], fill=(252, 246, 230, 130), width=7 * SS)
            d.line([a, b], fill=ROUTE + (135,), width=3 * SS)
    for i, (x, y) in enumerate(pts):
        last = i == len(pts) - 1
        r = (12 if last and highlight_last else 8) * SS
        dot(d, x, y, r + 5 * SS, (252, 246, 230, 210))
        dot(d, x, y, r, ROUTE + (255,), outline=(252, 246, 230), width=2)
        if last and highlight_last:
            d.ellipse([x - r - 9 * SS, y - r - 9 * SS, x + r + 9 * SS, y + r + 9 * SS],
                      outline=GOLD + (230,), width=2 * SS)
    return im


def draw_pin_spots(im, names):
    """总图上给每个事件城市留一个浅色底托，GameMap 的图钉压在上面。"""
    d = ImageDraw.Draw(im, "RGBA")
    for n in sorted(set(names)):
        lat, lon = CITIES[n]
        x, y = px(lat, lon)
        dot(d, x, y, 11 * SS, (250, 244, 228, 190))
        dot(d, x, y, 5 * SS, PIN_SPOT + (235,))
    return im


def save(im, name):
    OUT.mkdir(parents=True, exist_ok=True)
    out = im.resize((W, H), Image.LANCZOS)
    f = OUT / f"{name}.webp"
    out.save(f, "WEBP", quality=86, method=6)
    print(f"  ✓ {f.relative_to(ROOT)}  {f.stat().st_size // 1024} KB")


ROUTES = {
    "route_1219_khorasan": ["samarkand", "bukhara", "merv", "nishapur"],
    "route_1221_hajj":     ["nishapur", "baghdad", "mecca", "damascus", "malatya", "erzincan", "larende"],
    "route_1233_syria":    ["konya", "taurus", "aleppo", "damascus"],
    "route_1247_damascus": ["konya", "taurus", "aleppo", "damascus"],
}

PIN_CITIES = ["samarkand", "nishapur", "larende", "konya", "damascus", "aleppo"]


def main():
    print("[maps] 画底图……")
    base = base_map()

    gen = draw_pin_spots(base.copy(), PIN_CITIES)
    save(gen, "rumi_general_map")

    for name, cities in ROUTES.items():
        im = draw_route(base.copy(), cities)
        save(im, name)

    print("\n城市坐标（timeline.json / map_travel 直接用这些数）：")
    for n in sorted(set(PIN_CITIES) | {c for v in ROUTES.values() for c in v}):
        x, y = city_xy(n)
        print(f"  {n:<12} x={x:<6} y={y}")


if __name__ == "__main__":
    main()
