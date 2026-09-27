#!/usr/bin/env python3
"""按 rumi_geo.py 的坐标画鲁米线的地图（总图 + 4 张路线图）。

为什么不生成：AI 地图画到哪算哪，而且必出乱码地名；换一次图，图钉和途经点
就要重标一次（AUDIT.md 里踩过）。代码画的地图和坐标是同一份数据，永远对得上。

第一版画出来是「一摊蓝色块撒在米黄底上」——海岸线只有十来个点、陆地全平、
山是同一个三角形反复盖章。这一版：
  · 海岸线加密到几十个点，半岛海湾岛屿都点出来
  · 先堆一张高程场（山脉控制点 + 噪声），再算山体阴影 —— 陆地有了起伏
  · 沙漠 / 草原 / 绿洲分色，不再是一整片米黄
  · 山用高程场画脊线笔锋，不再盖图章
  · 总图不画城市点：游戏自己会在上面放图钉，画了会和图钉分家
    （科尼亚五个事件的图钉要错开摆，和画死在图上的点必然对不齐）

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

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rumi_geo import (BIOMES, CITIES, ISLANDS, LAT0, LAT1, LON0, LON1,  # noqa: E402
                      RANGES, RIVERS, SEAS, city_xy, to_xy)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "rumi" / "maps"

W, H = 1920, 1080
SS = 2                      # 超采样倍数，画完再缩回去
PW, PH = W * SS, H * SS

# 细密画的色：青金石、绿松石、朱砂、赭石、金。
PARCHMENT = (228, 211, 176)
LAND_DESERT = (223, 199, 155)
LAND_STEPPE = (205, 194, 150)
LAND_FERTILE = (176, 184, 138)
SEA_DEEP = (34, 60, 108)
SEA_SHALLOW = (66, 124, 146)
SEA_EDGE = (24, 42, 78)
SHORE = (240, 228, 198)
RIVER = (58, 100, 146)
ROUTE = (172, 52, 38)
GOLD = (186, 150, 82)


def px(lat, lon):
    x, y = to_xy(lat, lon)
    return x / 100 * PW, y / 100 * PH


def deg_px(d):
    """经度方向上，d 度折合多少像素。"""
    return d / (LON1 - LON0) * PW


def jitter(pts, amp=3, seed=0):
    rnd = random.Random(seed)
    return [(x + rnd.uniform(-amp, amp) * SS, y + rnd.uniform(-amp, amp) * SS) for x, y in pts]


def smooth(pts, closed=True, steps=12):
    """Catmull-Rom 插值：粗轮廓直接连是硬折线，插完才像海岸。"""
    n = len(pts)
    if n < 3:
        return pts
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1, p2 = pts[i % n], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    return out


def push_out(pts, pad=1.6):
    """贴图边的点往图外推：样条首尾相接处会过冲，甩出的圈得跑到画面外。"""
    out = []
    for lat, lon in pts:
        lat = LAT1 + pad if lat >= LAT1 - 0.01 else (LAT0 - pad if lat <= LAT0 + 0.01 else lat)
        lon = LON0 - pad if lon <= LON0 + 0.01 else (LON1 + pad if lon >= LON1 - 0.01 else lon)
        out.append((lat, lon))
    return out


def sea_polys():
    out = []
    for i, (name, pts) in enumerate(SEAS.items()):
        raw = jitter([px(lat, lon) for lat, lon in push_out(pts)], amp=2.5, seed=i * 13 + 1)
        out.append((name, smooth(raw, closed=True, steps=14)))
    return out


def island_polys():
    return [smooth(jitter([px(a, b) for a, b in pts], 2, 500 + i), True, 10)
            for i, (name, pts) in enumerate(ISLANDS.items())]


def sea_mask():
    m = Image.new("L", (PW, PH), 0)
    d = ImageDraw.Draw(m)
    for _, poly in sea_polys():
        d.polygon(poly, fill=255)
    for poly in island_polys():          # 岛是陆地，从海里挖回来
        d.polygon(poly, fill=0)
    return m


# ---------- 高程 ----------
def height_field():
    """沿山脉控制点堆高斯包，再加一层噪声——一张粗糙的高程图。"""
    hh, hw = PH // 4, PW // 4          # 四分之一分辨率算，够用且快
    h = np.zeros((hh, hw), dtype=np.float32)
    yy, xx = np.mgrid[0:hh, 0:hw].astype(np.float32)
    for name, weight, ctrl in RANGES:
        line = (smooth([px(a, b) for a, b in ctrl], closed=False, steps=10)
                if len(ctrl) > 2 else [px(a, b) for a, b in ctrl])
        rnd = random.Random(abs(hash(name)) & 0xFFFF)
        # 包收窄、点加密：宽高斯摊出来是一团雾，窄而密才有山脊
        for (x, y) in line:
            cx, cy = x / 4, y / 4
            r = deg_px(rnd.uniform(0.45, 0.85)) / 4
            h += weight * rnd.uniform(0.7, 1.25) * np.exp(
                -((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))
    # 分形噪声：低频给大地形起伏，高频给山体表面的纹理。
    # 没有这层，山体阴影只在山脉那几条线上有，平原一片死平。
    rng = np.random.default_rng(11)
    total = np.zeros_like(h)
    amp = 1.0
    for octave in (6, 12, 24, 48, 96):
        small = rng.random((octave + 2, int(octave * hw / hh) + 2)).astype(np.float32)
        up = np.asarray(Image.fromarray((small * 255).astype(np.uint8))
                        .resize((hw, hh), Image.BICUBIC), dtype=np.float32) / 255.0
        total += up * amp
        amp *= 0.55
    total /= total.max()
    h = np.clip(h * 1.0 + total * 0.30, 0, None)
    h = h / max(1e-6, float(h.max()))
    return h ** 0.85


def hillshade(h, az=315.0, alt=42.0):
    """标准山体阴影：高程求梯度，和光向点积。"""
    gy, gx = np.gradient(h.astype(np.float32))
    z = 165.0                     # 垂直夸张。26 的时候梯度几乎为零，打光等于没打
    gx, gy = gx * z, gy * z
    slope = np.arctan(np.hypot(gx, gy))
    asp = np.arctan2(-gy, gx)
    azr, altr = math.radians(360.0 - az + 90.0), math.radians(alt)
    shade = (math.sin(altr) * np.cos(slope) +
             math.cos(altr) * np.sin(slope) * np.cos(azr - asp))
    return np.clip(shade, 0, 1)


def biome_layer():
    """沙漠 / 草原 / 绿洲的色块，模糊后当陆地底色。"""
    im = Image.new("RGB", (PW // 2, PH // 2), PARCHMENT)
    d = ImageDraw.Draw(im)
    color = {"desert": LAND_DESERT, "steppe": LAND_STEPPE, "fertile": LAND_FERTILE}
    for name, kind, rad, pts in BIOMES:
        c = color[kind]
        for lat, lon in pts:
            x, y = px(lat, lon)
            r = deg_px(rad) / 2
            d.ellipse([x / 2 - r, y / 2 - r, x / 2 + r, y / 2 + r], fill=c)
    return im.filter(ImageFilter.GaussianBlur(13 * SS)).resize((PW, PH), Image.BILINEAR)


def land_base():
    """陆地：地貌平涂 + 纸纹。不做山体阴影——

    试过标准 hillshade：高程场在四分之一分辨率上算完再放大，山脉出来是
    一条条糊掉的深色毛虫，比没有还难看。这条线的画风是细密画，地图上的山
    本来就该是「一排排带墨线的圆丘」，平涂、有轮廓、按前后叠压，不是照片式
    的明暗。所以地形交给 draw_ranges 画，底子保持干净。
    """
    im = biome_layer()
    g = np.random.default_rng(5).integers(120, 168, size=(PH // 2, PW // 2), dtype=np.uint8)
    grain = (Image.fromarray(g).resize((PW, PH), Image.BILINEAR)
             .filter(ImageFilter.GaussianBlur(SS * 0.6)))
    return Image.blend(im, Image.merge("RGB", (grain, grain, grain)), 0.10)


def hump(d, x, y, w, h, face, shade, ink):
    """一座小山：圆顶的丘，左亮右暗，外面一圈墨线。"""
    d.polygon([(x - w, y), (x - w * 0.62, y - h * 0.72), (x - w * 0.18, y - h),
               (x + w * 0.26, y - h * 0.80), (x + w * 0.72, y - h * 0.40), (x + w, y)],
              fill=face)
    d.polygon([(x - w * 0.18, y - h), (x + w * 0.26, y - h * 0.80),
               (x + w * 0.72, y - h * 0.40), (x + w, y), (x + w * 0.05, y)],
              fill=shade)
    d.line([(x - w, y), (x - w * 0.62, y - h * 0.72), (x - w * 0.18, y - h),
            (x + w * 0.26, y - h * 0.80), (x + w * 0.72, y - h * 0.40), (x + w, y)],
           fill=ink, width=max(1, int(SS * 1.3)), joint="curve")


def draw_ranges(im):
    """山脉：沿控制线排一串圆丘，由远及近叠压。

    高的山脉（weight 大）丘更大、颜色更重，还会在后面排一层小的，
    看上去是一道有纵深的山脊，而不是一行图章。
    """
    d = ImageDraw.Draw(im, "RGBA")
    for ri, (name, weight, ctrl) in enumerate(RANGES):
        line = smooth([px(a, b) for a, b in ctrl], closed=False, steps=12)
        rnd = random.Random(300 + ri)
        base_w = (10 + 13 * weight) * SS
        rows = 2 if weight >= 0.85 else 1
        for row in range(rows):
            back = row == 0 and rows > 1
            k = 0.72 if back else 1.0
            dy = (-6 * SS) if back else 0
            face = (206, 176, 124, 235) if back else (214, 183, 128, 250)
            shade = (170, 136, 90, 235) if back else (164, 126, 78, 250)
            ink = (104, 78, 48, 200 if back else 235)
            step = max(1, int(base_w * k * 1.15 / max(1e-6, _spacing(line))))
            pts = line[::step]
            for i, (x, y) in enumerate(pts):
                w_ = base_w * k * rnd.uniform(0.82, 1.18)
                h_ = w_ * rnd.uniform(0.66, 0.95)
                hump(d, x + rnd.uniform(-3, 3) * SS,
                     y + dy + rnd.uniform(-3, 3) * SS, w_, h_, face, shade, ink)
    return im


def _spacing(line):
    """折线上相邻采样点的平均间距，用来把丘排得不疏不密。"""
    if len(line) < 2:
        return 1.0
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(line, line[1:]))
    return total / (len(line) - 1)


def draw_dunes(im):
    """沙漠里撒一层细点，和草原、绿洲区分开。"""
    d = ImageDraw.Draw(im, "RGBA")
    rnd = random.Random(909)
    for name, kind, rad, pts in BIOMES:
        if kind != "desert":
            continue
        for lat, lon in pts:
            cx, cy = px(lat, lon)
            r = deg_px(rad) * 0.85
            for _ in range(int(r / SS / 2.2)):
                a = rnd.uniform(0, math.tau)
                rr = r * math.sqrt(rnd.random())
                x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.9
                ln = rnd.uniform(5, 13) * SS
                d.arc([x - ln, y - ln * 0.45, x + ln, y + ln * 0.45],
                      200, 340, fill=(176, 146, 100, 90), width=max(1, SS))
    return im


def draw_seas(im):
    polys = sea_polys()
    mask = sea_mask()

    halo = mask.filter(ImageFilter.GaussianBlur(10 * SS))
    im.paste(Image.new("RGB", (PW, PH), SHORE), (0, 0), Image.eval(halo, lambda v: int(v * 0.5)))

    sea = Image.new("RGB", (PW, PH), SEA_SHALLOW)
    inner = mask.filter(ImageFilter.GaussianBlur(14 * SS))
    inner = Image.eval(inner, lambda v: 255 if v > 246 else 0).filter(ImageFilter.GaussianBlur(10 * SS))
    sea = Image.composite(Image.new("RGB", (PW, PH), SEA_DEEP), sea, inner)

    wd = ImageDraw.Draw(sea)
    rnd = random.Random(3)
    for y in range(0, PH, 13 * SS):
        for _ in range(4):
            x0 = rnd.randrange(PW)
            wd.line([(x0, y), (x0 + rnd.randrange(30, 150) * SS, y)],
                    fill=(188, 214, 226), width=SS)
    im.paste(sea, (0, 0), mask)

    # 岸线：画在单独一层再按（略微外扩的）海遮罩贴回，图边的样条过冲被挡掉
    edge = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    for _, poly in polys:
        ed.line(poly + [poly[0]], fill=SEA_EDGE + (225,), width=3 * SS, joint="curve")
    for poly in island_polys():
        ed.line(poly + [poly[0]], fill=SEA_EDGE + (225,), width=2 * SS, joint="curve")
    im.paste(edge.convert("RGB"), (0, 0),
             Image.composite(edge.split()[3], Image.new("L", (PW, PH), 0),
                             mask.filter(ImageFilter.MaxFilter(9))))
    return im


def draw_rivers(im):
    d = ImageDraw.Draw(im, "RGBA")
    for i, line in enumerate(RIVERS):
        pts = smooth(jitter([px(a, b) for a, b in line], 3, 100 + i), closed=False, steps=10)
        d.line(pts, fill=(246, 234, 206, 90), width=5 * SS, joint="curve")
        d.line(pts, fill=RIVER + (235,), width=2 * SS, joint="curve")
    return im


def draw_peaks(im, h):
    """高程高处点几笔脊线，给山体阴影加一点手绘笔锋。"""
    d = ImageDraw.Draw(im, "RGBA")
    hh, hw = h.shape
    rnd = random.Random(77)
    for name, weight, ctrl in RANGES:
        if weight < 0.8:
            continue
        line = smooth([px(a, b) for a, b in ctrl], closed=False, steps=8)
        for (x, y) in line[::max(1, len(line) // 14)]:
            hy, hx = int(y / 4), int(x / 4)
            if not (0 <= hy < hh and 0 <= hx < hw) or h[hy, hx] < 0.35:
                continue
            w_ = rnd.uniform(9, 15) * SS
            ht = rnd.uniform(10, 17) * SS
            xx = x + rnd.uniform(-6, 6) * SS
            yy = y + rnd.uniform(-6, 6) * SS
            d.line([(xx - w_, yy), (xx, yy - ht), (xx + w_ * 0.9, yy)],
                   fill=(96, 70, 44, 150), width=max(1, int(SS * 1.2)))
    return im


def draw_border(im):
    d = ImageDraw.Draw(im, "RGBA")
    for inset, w, a in ((16, 2, 190), (26, 5, 230), (40, 1, 160)):
        i = inset * SS
        d.rectangle([i, i, PW - i, PH - i], outline=GOLD + (a,), width=w * SS)
    c = 26 * SS
    for cx, cy in ((c, c), (PW - c, c), (c, PH - c), (PW - c, PH - c)):
        r = 7 * SS
        d.rectangle([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (230,))
    return im


def base_map():
    im = land_base()
    im = draw_dunes(im)
    im = draw_seas(im)
    im = draw_rivers(im)
    im = draw_ranges(im)
    return draw_border(im)


def dot(d, x, y, r, fill, outline=None, width=3):
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill,
              outline=outline, width=width * SS if outline else 0)


def draw_route(im, names):
    """城市之间一条朱砂虚线，每座城一个点，终点加金圈。"""
    d = ImageDraw.Draw(im, "RGBA")
    pts = [px(*CITIES[n]) for n in names]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        n_dash = max(2, int(seg / (16 * SS)))
        for k in range(n_dash):
            t0 = k / n_dash
            t1 = min(1.0, t0 + 0.55 / n_dash)
            a = (x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0)
            b = (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)
            d.line([a, b], fill=(252, 246, 230, 150), width=7 * SS)
            d.line([a, b], fill=ROUTE + (165,), width=3 * SS)
    for i, (x, y) in enumerate(pts):
        last = i == len(pts) - 1
        r = (12 if last else 8) * SS
        dot(d, x, y, r + 5 * SS, (252, 246, 230, 215))
        dot(d, x, y, r, ROUTE + (255,), outline=(252, 246, 230), width=2)
        if last:
            d.ellipse([x - r - 9 * SS, y - r - 9 * SS, x + r + 9 * SS, y + r + 9 * SS],
                      outline=GOLD + (230,), width=2 * SS)
    return im


def save(im, name):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"{name}.webp"
    im.resize((W, H), Image.LANCZOS).save(f, "WEBP", quality=88, method=6)
    print(f"  ✓ {f.relative_to(ROOT)}  {f.stat().st_size // 1024} KB")


ROUTES = {
    "route_1219_khorasan": ["samarkand", "bukhara", "merv", "nishapur"],
    "route_1221_hajj":     ["nishapur", "baghdad", "mecca", "damascus", "malatya", "erzincan", "larende"],
    "route_1233_syria":    ["konya", "taurus", "aleppo", "damascus"],
    "route_1247_damascus": ["konya", "taurus", "aleppo", "damascus"],
}


def main():
    print("[maps] 画底图（高程 + 山体阴影）……")
    base = base_map()
    save(base.copy(), "rumi_general_map")
    for name, cities in ROUTES.items():
        save(draw_route(base.copy(), cities), name)
    print("\n城市坐标（timeline.json / map_travel 直接用这些数）：")
    for n in sorted({c for v in ROUTES.values() for c in v}):
        x, y = city_xy(n)
        print(f"  {n:<12} x={x:<6} y={y}")


if __name__ == "__main__":
    main()
