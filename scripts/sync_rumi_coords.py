#!/usr/bin/env python3
"""把 rumi_geo.py 的城市坐标写进 timeline.json 的图钉和各 map_travel 的途经点。

地图是按同一张表画的（make_rumi_maps.py），所以跑完这个脚本，图钉和途经点
必然落在图上画的那座城上——不再靠人眼估。

同城的多个事件（科尼亚有五个）会沿一个小圆散开，免得图钉摞在一起。

    python scripts/make_rumi_maps.py && python scripts/sync_rumi_coords.py
"""
import sys

# Windows 上 npm 起的 python 默认是 cp1252，print 中文会直接抛 UnicodeEncodeError，
# 把整条 npm script 带崩。这里显式把标准输出改成 utf-8，不依赖环境变量。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import io
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rumi_geo import city_xy  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "src" / "data" / "rumi" / "events"
TIMELINE = ROOT / "src" / "data" / "rumi" / "timeline.json"

# 事件 → 图钉所在的城
EVENT_CITY = {
    "1219_balkh":     "samarkand",
    "1220_nishapur":  "nishapur",
    "1225_larende":   "larende",
    "1231_konya":     "konya",
    "1233_syria":     "damascus",
    "1244_shams":     "konya",
    "1247_damascus":  "damascus",
    "1250_goldsmith": "konya",
    "1258_masnavi":   "konya",
    "1273_wedding":   "konya",
}

# map_travel 的途经点 id → 城。托罗斯山口不是城，但在表里有坐标。
WAYPOINT_CITY = {
    "samarkand": "samarkand", "bukhara": "bukhara", "merv": "merv", "nishapur": "nishapur",
    "baghdad": "baghdad", "mecca": "mecca", "damascus": "damascus", "erzincan": "erzincan",
    "larende": "larende", "konya": "konya", "taurus": "taurus", "aleppo": "aleppo",
    "malatya": "malatya",
}

# 同城多事件怎么摆：沿一条短线按年代排开，而不是围成一圈。
#
# 围成一圈的话，按年代走一遍等于在圈上来回穿，地图上的旅程线就缠成一团；
# 排成一条线，簇内就是一路平走。方向取「垂直于该城→下一个外地城」——
# 科尼亚的两趟叙利亚往返因此接近平行，不互相穿。
CLUSTER = {
    # 城 : (方向单位向量, 相邻两点间距 %, 整簇偏移)
    # 科尼亚 → 大马士革大致是 (+7, +16)，取其垂线 (0.92, -0.40)。
    # 整簇再往西北推一点，避开只差 0.7 度的拉兰达。
    "konya": ((0.92, -0.40), 1.9, (-0.5, -1.5)),
}
DEFAULT_DIR, DEFAULT_GAP = (1.0, 0.0), 2.0


def spread_positions(n, x, y, city):
    """n 个事件在同一座城：1 个就原地，多个沿一条短线按年代排开。"""
    if n == 1:
        return [(x, y)]
    (dx, dy), gap, (ox, oy) = CLUSTER.get(city, (DEFAULT_DIR, DEFAULT_GAP, (0.0, 0.0)))
    cx, cy = x + ox, y + oy
    out = []
    for i in range(n):
        t = (i - (n - 1) / 2) * gap          # 居中：…-2 -1 0 1 2…
        out.append((round(cx + dx * t, 1), round(cy + dy * t, 1)))
    return out


def main():
    # ---- timeline 图钉 ----
    tl = json.loads(TIMELINE.read_text(encoding="utf-8"))
    by_city = {}
    for st in tl["stages"]:
        for ev in st["events"]:
            by_city.setdefault(EVENT_CITY[ev["id"]], []).append(ev)

    moved = 0
    for city, evs in by_city.items():
        x, y = city_xy(city)
        for ev, (nx, ny) in zip(evs, spread_positions(len(evs), x, y, city)):
            loc = ev.setdefault("location", {})
            if (loc.get("mapX"), loc.get("mapY")) != (nx, ny):
                loc["mapX"], loc["mapY"] = nx, ny
                moved += 1
            print(f"  {ev['id']:<15} {city:<10} → ({nx}, {ny})")
    io.open(TIMELINE, "w", encoding="utf-8", newline="\n").write(
        json.dumps(tl, ensure_ascii=False, indent=2) + "\n")
    print(f"\ntimeline：{moved} 个图钉更新\n")

    # ---- map_travel 途经点 ----
    total = 0
    for d in sorted(EVENTS.iterdir()):
        f = d / "event.json"
        if not f.exists():
            continue
        ev = json.loads(f.read_text(encoding="utf-8"))
        changed = False
        for ph in ev.get("phases", []):
            if ph.get("type") != "map_travel":
                continue
            for w in ph.get("waypoints", []):
                city = WAYPOINT_CITY.get(w.get("id"))
                if not city:
                    print(f"  ! {d.name}/{ph['id']} 的途经点 {w.get('id')} 没有对应城市")
                    continue
                x, y = city_xy(city)
                if (w.get("x"), w.get("y")) != (x, y):
                    w["x"], w["y"] = x, y
                    changed = True
                    total += 1
        if changed:
            io.open(f, "w", encoding="utf-8", newline="\n").write(
                json.dumps(ev, ensure_ascii=False, indent=2) + "\n")
            print(f"  ✓ {d.name}")
    print(f"\n途经点：{total} 个更新")


if __name__ == "__main__":
    main()
