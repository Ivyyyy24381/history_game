#!/usr/bin/env python3
"""全局数据审查：断链、图片规格、各 phase 类型的内部一致性。

lint_phases.mjs 管的是「这一幕算不算认知动作」，这个脚本管的是「这一幕的数据
自己对不对」——answer 指向不存在的选项、热区比 need 少、连环画分格出界、
背景图其实是竖的，这些跑起来不报错，但玩家会撞上。

    python scripts/audit_data.py            # 全部故事线
    python scripts/audit_data.py rumi       # 只看一条
"""
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA = ROOT / "src" / "data"

problems = []      # (级别, 位置, 说明)


def err(where, msg):
    problems.append(("错误", where, msg))


def warn(where, msg):
    problems.append(("提醒", where, msg))


# ---------- 资产 ----------
_img_cache = {}


def image_info(rel):
    """返回 (宽, 高, 有无 alpha)；文件不存在或读不了返回 None。"""
    if rel in _img_cache:
        return _img_cache[rel]
    f = PUBLIC / rel.lstrip("/")
    info = None
    if f.exists() and Image is not None and f.suffix.lower() != ".svg":
        try:
            im = Image.open(f)
            alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            info = (im.width, im.height, alpha)
        except Exception:
            info = None
    _img_cache[rel] = info
    return info


def is_sea(rel, x_pct, y_pct):
    """采样地图上那一点的颜色，判断是不是落在水里。

    图钉和途经点都是百分比坐标，光看数字看不出它压在海上还是陆上；
    直接量底图的像素最直接。蓝多绿少就算水。"""
    f = PUBLIC / rel.lstrip("/")
    if Image is None or not f.exists():
        return None
    try:
        im = Image.open(f).convert("RGB")
    except Exception:
        return None
    x = min(im.width - 1, max(0, int(x_pct / 100 * im.width)))
    y = min(im.height - 1, max(0, int(y_pct / 100 * im.height)))
    # 取一大片里蓝色像素的占比。只看一个点会把「城在江边」误判成落水——
    # 潭州本来就压在湘江上。要求周围一大片都是水，才算真的掉进海里。
    rad = max(10, int(min(im.width, im.height) * 0.02))
    box = im.crop((max(0, x - rad), max(0, y - rad),
                   min(im.width, x + rad + 1), min(im.height, y + rad + 1)))
    px_ = list(box.getdata())
    if not px_:
        return None
    blue = sum(1 for (r, g, b) in px_ if b > r + 28 and b > 80)
    return blue / len(px_) > 0.7


def check_assets(line, name, blob):
    for rel in sorted(set(re.findall(r'"(/assets/[^"]+)"', blob))):
        f = PUBLIC / rel.lstrip("/")
        if not f.exists():
            err(f"{line}/{name}", f"断链：{rel}")


# ---------- 每种 phase 的内部一致性 ----------
def opt_ids(p):
    return {o.get("id") for o in p.get("options", []) if isinstance(o, dict)}


def check_phase(line, eid, i, p):
    where = f"{line}/{eid} 第{i + 1}幕 {p.get('type')}({p.get('id', '')})"
    t = p.get("type")

    if t in ("predict_reveal", "dark_explore", "scratch_reveal"):
        ids = opt_ids(p)
        actual = p.get("actual")
        if actual is not None and ids and actual not in ids:
            err(where, f"actual=\"{actual}\" 不在选项里：{sorted(ids)}")
        if len(ids) != len(p.get("options", [])):
            err(where, "选项 id 有重复或缺失")

    if t == "dark_explore":
        spots = p.get("spots", [])
        need = p.get("need")
        if need is not None and need > len(spots):
            err(where, f"need={need} 比热区数 {len(spots)} 还多，这一幕过不去")
        for s in spots:
            if not (0 <= s.get("x", -1) <= 100 and 0 <= s.get("y", -1) <= 100):
                err(where, f"热区 {s.get('id')} 坐标出界：x={s.get('x')} y={s.get('y')}")

    if t == "eavesdrop":
        voices = p.get("voices", [])
        need = p.get("need")
        sup = sum(1 for v in voices if v.get("supports"))
        if need is not None and need > len(voices):
            err(where, f"need={need} 比声音数 {len(voices)} 还多")
        pick = p.get("pick")
        if pick is not None and pick > sup:
            err(where, f"pick={pick} 比 supports=true 的条数 {sup} 还多")
        xs = sorted(v.get("x", 0) for v in voices)
        for a, b in zip(xs, xs[1:]):
            if b - a < 8:
                warn(where, f"两个声音挨得太近（x={a} 和 x={b}），会同时听清")

    if t == "evidence_select":
        items = p.get("items", [])
        sup = sum(1 for it in items if it.get("supports"))
        pick = p.get("pick")
        if pick is not None and pick != sup:
            err(where, f"pick={pick} 但 supports=true 的有 {sup} 条")
        for it in items:
            if not it.get("why"):
                warn(where, f"证据 {it.get('id')} 没写 why（选错时没有解释）")

    if t == "link_match":
        left = {x.get("id") for x in p.get("left", [])}
        right = {x.get("id") for x in p.get("right", [])}
        ans = p.get("answer", {})
        for k, v in ans.items():
            if k not in left:
                err(where, f"answer 的左项 \"{k}\" 不存在")
            if v not in right:
                err(where, f"answer 的右项 \"{v}\" 不存在")
        missing = left - set(ans)
        if missing:
            err(where, f"左边这些没给答案：{sorted(missing)}")

    if t == "comic_reveal":
        for pa in p.get("panels", []):
            x, y = pa.get("x", 0), pa.get("y", 0)
            w, h = pa.get("w", 0), pa.get("h", 0)
            if x + w > 100.5 or y + h > 100.5:
                err(where, f"分格 {pa.get('id')} 出界：x+w={x + w} y+h={y + h}")
            if w < 5 or h < 5:
                warn(where, f"分格 {pa.get('id')} 太小：{w}×{h}")
        img = p.get("image") or p.get("background")
        if img:
            info = image_info(img)
            if info and info[0] / info[1] < 1.2:
                warn(where, f"连环画底图不是横图（{info[0]}×{info[1]}），分格多半标错了")

    if t == "map_travel":
        bg_ = p.get("background")
        for w_ in p.get("waypoints", []):
            if not (0 <= w_.get("x", -1) <= 100 and 0 <= w_.get("y", -1) <= 100):
                err(where, f"途经点 {w_.get('id')} 坐标出界")
            elif bg_ and is_sea(bg_, w_["x"], w_["y"]):
                err(where, f"途经点 {w_.get('id')} 落在水里（{w_['x']}, {w_['y']}）")

    if t == "explore":
        need = p.get("requiredTalks")
        npcs = p.get("npcs", [])
        if need is not None and need > len(npcs):
            err(where, f"requiredTalks={need} 比 NPC 数 {len(npcs)} 还多，这一幕过不去")
        for n in npcs:
            pos = n.get("position", {})
            if not (0 <= pos.get("x", -1) <= 100 and 0 <= pos.get("y", -1) <= 100):
                err(where, f"NPC {n.get('id')} 位置出界")
            por = n.get("portrait")
            if por:
                info = image_info(por)
                if info and not info[2]:
                    err(where, f"NPC {n.get('id')} 的立绘没有透明底：{por}")
                if info and info[0] > info[1]:
                    warn(where, f"NPC {n.get('id')} 的立绘是横图（{info[0]}×{info[1]}），多半不对")

    if t == "flee_florence":
        limit, items = p.get("limit"), p.get("items", [])
        if limit is not None and limit >= len(items):
            err(where, f"limit={limit} 但只有 {len(items)} 件，没得取舍")

    if t == "poem_compose":
        blanks = p.get("blanks", [])
        holes = str(p.get("puzzle", "")).count("___")
        if holes != len(blanks):
            err(where, f"puzzle 里有 {holes} 个空，blanks 给了 {len(blanks)} 个")

    # 背景规格
    bg = p.get("background")
    if bg and not bg.endswith(".svg"):
        info = image_info(bg)
        if info:
            w_, h_ = info[0], info[1]
            if w_ / h_ < 1.3:
                warn(where, f"背景不是宽幅（{w_}×{h_}），在 16:9 的舞台上会被裁")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    lines = [d.name for d in sorted(DATA.iterdir())
             if d.is_dir() and (d / "events").is_dir() and (not only or d.name == only)]

    n_ev = n_ph = 0
    for line in lines:
        tl = DATA / line / "timeline.json"
        if tl.exists():
            blob = tl.read_text(encoding="utf-8")
            check_assets(line, "timeline.json", blob)
            t = json.loads(blob)
            ids_in_timeline = {e["id"] for s in t.get("stages", []) for e in s.get("events", [])}
            on_disk = {d.name for d in (DATA / line / "events").iterdir() if d.is_dir()}
            for missing in sorted(ids_in_timeline - on_disk):
                err(f"{line}/timeline", f"事件 {missing} 在时间轴里有，但没有 event.json")
            for extra in sorted(on_disk - ids_in_timeline):
                warn(f"{line}/timeline", f"事件 {extra} 有 event.json，但时间轴里没登记（玩家进不去）")
            # 图钉落在水里
            gmap = t.get("character", {}).get("generalMap")
            if gmap:
                for st in t.get("stages", []):
                    for e in st.get("events", []):
                        lo = e.get("location", {})
                        if lo.get("mapX") is None:
                            continue
                        if is_sea(gmap, lo["mapX"], lo["mapY"]):
                            err(f"{line}/timeline", f"{e['id']} 的图钉落在水里（{lo['mapX']}, {lo['mapY']}）")

            # 图钉重叠
            pts = [(e["id"], e.get("location", {}).get("mapX"), e.get("location", {}).get("mapY"))
                   for s in t.get("stages", []) for e in s.get("events", [])]
            for i in range(len(pts)):
                for j in range(i + 1, len(pts)):
                    a, b = pts[i], pts[j]
                    if None in (a[1], a[2], b[1], b[2]):
                        continue
                    if abs(a[1] - b[1]) < 1.5 and abs(a[2] - b[2]) < 1.5:
                        warn(f"{line}/timeline", f"图钉重叠：{a[0]} 和 {b[0]} 都在 ({a[1]}, {a[2]})")
        else:
            err(line, "没有 timeline.json —— 这条线在游戏里进不去")

        for d in sorted((DATA / line / "events").iterdir()):
            f = d / "event.json"
            if not f.exists():
                continue
            blob = f.read_text(encoding="utf-8")
            check_assets(line, d.name, blob)
            ev = json.loads(blob)
            n_ev += 1
            seen = set()
            for i, p in enumerate(ev.get("phases", [])):
                n_ph += 1
                pid = p.get("id")
                if pid in seen:
                    err(f"{line}/{d.name}", f"幕 id 重复：{pid}")
                seen.add(pid)
                check_phase(line, d.name, i, p)

    print(f"审查了 {len(lines)} 条线 · {n_ev} 个事件 · {n_ph} 幕\n")
    errs = [p for p in problems if p[0] == "错误"]
    warns = [p for p in problems if p[0] == "提醒"]
    for lvl, group in (("错误", errs), ("提醒", warns)):
        if not group:
            continue
        print(f"—— {lvl} {len(group)} 条 ——")
        for _, where, msg in group:
            print(f"  [{where}] {msg}")
        print()
    if not problems:
        print("没发现问题。")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
