/**
 * Map with event-level pin markers + pan/zoom.
 *
 * 交互：
 * - 滚轮缩放（以鼠标位置为中心），拖拽平移，双击复位
 * - 右下角 ＋/－/⟲ 按钮
 * - 切换事件（时间轴或点图钉）时自动放大并居中该事件地点
 *
 * 旅人与墨线路径：
 * - 主角 token 站在当前事件位置；年份推进时沿手绘感的墨线路径走过去，
 *   配一串渐次点亮的足迹，走完落定
 * - 已走过的路段是实墨线，未来的路段是极淡的铅笔稿（虚线）
 * - 路径用 Catmull-Rom 转三次贝塞尔 + 垂直向确定性抖动，画在地图坐标系里，
 *   跟随 pan/zoom 变换；prefers-reduced-motion 时不做行走动画，直接落定
 *
 * Pin states:
 *   - Current event:   walker 立绘站在该点
 *   - Past events:     full color, smaller pin, ✓ inside the pin
 *   - Future events:   muted color, smaller pin, no badge
 */
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { asset } from "../utils/asset";
import { dufuPortraitPath } from "../data/dufuPoses";
import { dantePortraitPath } from "../data/dantePoses";
import { rumiPortraitPath } from "../data/rumiPoses";
import usePrefersReducedMotion from "../utils/usePrefersReducedMotion";
import { FONT, COLOR, TRACKING, SHADOW, paper, paperBtn, alpha } from "../styles/theme";
import { getCharacter } from "../data/characters";
import { t } from "../i18n/ui";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const FOCUS_SCALE = 2.1; // 自动聚焦时的放大倍数
// 兜底（人物 timeline 未提供 generalMap/mapRatio 时按杜甫地图处理）
const DEFAULT_MAP = "/assets/dufu/maps/dufu_general_map.webp";
const DEFAULT_RATIO = 1752 / 1245; // 地图原图宽高比

// 视口任意比例下，底图以 cover 方式铺满（宽或高撑满，可平移看其余部分）
function coverDims(W, H, ratio) {
  if (W / H >= ratio) return { cw: W, ch: W / ratio };
  return { cw: H * ratio, ch: H };
}

// ── 旅程墨线 ─────────────────────────────────────────────
// 确定性伪随机：同一条线每次渲染的「手绘抖动」必须一致（不用 Math.random）
const jitter = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // -1 .. 1
};

// Catmull-Rom → 第 i 段（pts[i] → pts[i+1]）的三次贝塞尔控制点，
// 再沿段的垂直方向加一点抖动，让线像手上画出来的而不是几何拟合
function segmentControls(pts, i) {
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(len * 0.14, 13);
  return {
    c1: {
      x: p1.x + (p2.x - p0.x) / 6 + nx * jitter(i * 2 + 1) * amp,
      y: p1.y + (p2.y - p0.y) / 6 + ny * jitter(i * 2 + 1) * amp,
    },
    c2: {
      x: p2.x - (p3.x - p1.x) / 6 + nx * jitter(i * 2 + 2) * amp,
      y: p2.y - (p3.y - p1.y) / 6 + ny * jitter(i * 2 + 2) * amp,
    },
  };
}

const segD = (pts, i) => {
  const { c1, c2 } = segmentControls(pts, i);
  return `M ${pts[i].x} ${pts[i].y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
};

// 旅程路径：fromIdx → toIdx（可倒走），拼接沿途各段；倒走时交换控制点次序
function travelD(pts, fromIdx, toIdx) {
  const parts = [`M ${pts[fromIdx].x} ${pts[fromIdx].y}`];
  if (toIdx > fromIdx) {
    for (let i = fromIdx; i < toIdx; i++) {
      const { c1, c2 } = segmentControls(pts, i);
      parts.push(`C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pts[i + 1].x} ${pts[i + 1].y}`);
    }
  } else {
    for (let i = fromIdx - 1; i >= toIdx; i--) {
      const { c1, c2 } = segmentControls(pts, i);
      parts.push(`C ${c2.x} ${c2.y}, ${c1.x} ${c1.y}, ${pts[i].x} ${pts[i].y}`);
    }
  }
  return parts.join(" ");
}

// 每条线的地图主题：在全局 token 之上做偏移（src/data/characters.js 的 mapTheme）
const DEFAULT_MAP_THEME = {
  ink: COLOR.ink,
  inkFaint: COLOR.secondary,
  seal: "#A63A2E",
  pin: "cinnabar",
  scrimBoost: 0,
};

/**
 * 同时代的地图符号（不用水滴 pin，用这张地图自己的语汇）：
 *   - 但丁线：红顶城塔剪影，与泥金手抄本底图上的城市符号同族
 *   - 杜甫线：朱砂圈点，像舆图上的批注圈
 * 三态一眼分清：已至 = 实墨 + 一枚小印章；未至 = 淡铅笔稿；
 * 当前 = 旅人立绘替代符号 + 呼吸高亮（在 GameMap 内渲染）。
 */
function MapSymbol({ kind, state, theme, size = 26 }) {
  const { ink, seal } = theme;
  const pencil = theme.inkFaint;
  const visited = state === "visited";
  // 纸色微光把符号从密的底图里托出来（halo 手法在小符号上的对应）
  const lift = visited
    ? `drop-shadow(0 0 2.5px ${paper(0.95)}) drop-shadow(0 2px 3px rgba(40,25,10,0.35))`
    : `drop-shadow(0 0 2px ${paper(0.8)})`;
  if (kind === "tower") {
    return (
      <svg width={size} height={(size * 30) / 24} viewBox="0 0 24 30" style={{ display: "block", filter: lift }}>
        {visited ? (
          <>
            <rect x="7.5" y="12" width="9" height="15.5" fill={ink} />
            <path d="M5.2 12.5 L12 3.2 L18.8 12.5 Z" fill={seal} />
            <rect x="10.8" y="17" width="2.4" height="4" fill={paper(0.92)} />
            {/* 已至的小印章 */}
            <g transform="rotate(-8 18.5 23.5)">
              <rect x="15" y="20" width="7" height="7" rx="1.2" fill={seal} />
              <text x="18.5" y="25.4" textAnchor="middle" fontSize="5.4" fontWeight="bold" fill={paper(0.95)}>{t("至")}</text>
            </g>
          </>
        ) : (
          <>
            <rect x="7.5" y="12" width="9" height="15.5" fill={paper(0.25)} stroke={pencil} strokeWidth="1.6" />
            <path d="M5.2 12.5 L12 3.2 L18.8 12.5 Z" fill={paper(0.25)} stroke={pencil} strokeWidth="1.6" strokeLinejoin="round" />
          </>
        )}
      </svg>
    );
  }
  // cinnabar：朱砂圈点
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", filter: lift }}>
      {visited ? (
        <>
          <circle cx="12" cy="12" r="8" fill={paper(0.28)} stroke={seal} strokeWidth="2.6" />
          <circle cx="12" cy="12" r="2.7" fill={ink} />
        </>
      ) : (
        <circle cx="12" cy="12" r="7.5" fill={paper(0.22)} stroke={pencil} strokeWidth="1.8" strokeDasharray="3 2.6" />
      )}
    </svg>
  );
}

export default function GameMap({
  timelineExpanded = false,
  allEvents,
  currentYear,
  currentEventId,
  progressYear,
  onEventClick,
  character,
}) {
  // 窄屏要把「上一个/下一个」缩成只有年份（见下面的 compactSteps）
  const [viewportW, setViewportW] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 总图与宽高比从 timeline.json 的 character 块读取（每条故事线一张图）
  const mapUrl = character?.generalMap || DEFAULT_MAP;
  const imgRatio = character?.mapRatio || DEFAULT_RATIO;
  const heroWalkerPath =
    character?.id === "dante" ? dantePortraitPath
    : character?.id === "rumi" ? rumiPortraitPath
    : dufuPortraitPath;
  // 每条线的墨色/印章/符号语汇/底图减淡：花名册 mapTheme 在全局 token 之上做偏移
  const mapTheme = { ...DEFAULT_MAP_THEME, ...(getCharacter(character?.id)?.mapTheme || {}) };
  const events = useMemo(
    () => (allEvents || []).slice().sort((a, b) => a.year - b.year),
    [allEvents]
  );
  const prefersReducedMotion = usePrefersReducedMotion();

  const viewportRef = useRef(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [animated, setAnimated] = useState(true);
  const dragRef = useRef(null);        // 当前拖拽状态
  const justDraggedRef = useRef(false); // 拖拽结束后抑制 click

  // 视口尺寸（驱动底图 cover 尺寸）
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dims = box.w ? coverDims(box.w, box.h, imgRatio) : null;

  // 事件坐标换算到底图像素坐标系（墨线的抖动/虚线在这个空间里不会被拉伸变形）
  const pts = useMemo(() => {
    if (!dims) return null;
    return events.map((e) => ({
      x: ((e.location?.mapX ?? 50) / 100) * dims.cw,
      y: ((e.location?.mapY ?? 50) / 100) * dims.ch,
    }));
  }, [events, dims?.cw, dims?.ch]);

  const clampView = useCallback((v) => {
    const el = viewportRef.current;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
    if (!el) return { scale: s, tx: 0, ty: 0 };
    const { width: W, height: H } = el.getBoundingClientRect();
    const { cw, ch } = coverDims(W, H, imgRatio);
    const tx = Math.min(0, Math.max(W - cw * s, v.tx));
    const ty = Math.min(0, Math.max(H - ch * s, v.ty));
    return { scale: s, tx, ty };
  }, [imgRatio]);

  // 把地图上 (xPct, yPct) 的点平滑移动到视口中心
  const focusOn = useCallback((xPct, yPct, scale = FOCUS_SCALE) => {
    const el = viewportRef.current;
    if (!el) return;
    const { width: W, height: H } = el.getBoundingClientRect();
    const { cw, ch } = coverDims(W, H, imgRatio);
    setAnimated(true);
    setView(clampView({
      scale,
      tx: W / 2 - (xPct / 100) * cw * scale,
      ty: H / 2 - (yPct / 100) * ch * scale,
    }));
  }, [clampView, imgRatio]);

  // 切换事件 → 自动聚焦该地点
  const currentEvent = events.find((e) => e.id === currentEventId);
  const curX = currentEvent?.location?.mapX;
  const curY = currentEvent?.location?.mapY;
  useEffect(() => {
    if (typeof curX === "number" && typeof curY === "number") {
      focusOn(curX, curY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEventId]);

  // ── 旅人行走状态 ──
  const [walkerPos, setWalkerPos] = useState(null);     // 底图像素坐标
  const [arrivedYear, setArrivedYear] = useState(null); // 旅人实际走到过的最远年份
  const [travel, setTravel] = useState(null);           // {d, key, toIdx, steps, dots, len, progress}
  const walkerIdxRef = useRef(null);
  const rafRef = useRef(null);
  const measureRef = useRef(null);

  // 实墨范围：走到过的 + 存档解锁的进度，取更远者
  const maxInkYear = Math.max(arrivedYear ?? -Infinity, progressYear ?? -Infinity);

  // 事件切换 → 旅人出发（或在无动画场景下直接落定）
  useEffect(() => {
    if (!pts || !pts.length) return;
    const toIdx = events.findIndex((e) => e.id === currentEventId);
    if (toIdx < 0) return;
    const fromIdx = walkerIdxRef.current;
    if (fromIdx === toIdx) return;
    const settle = () => {
      walkerIdxRef.current = toIdx;
      setWalkerPos(pts[toIdx]);
      setArrivedYear((y) => Math.max(y ?? -Infinity, events[toIdx].year));
      setTravel(null);
    };
    if (fromIdx == null || prefersReducedMotion) { settle(); return; }
    // 上一段行走未完成就切换：视作已到达上个目标，从那里继续走
    cancelAnimationFrame(rafRef.current);
    setTravel({
      d: travelD(pts, fromIdx, toIdx),
      key: `${fromIdx}->${toIdx}`,
      toIdx,
      steps: Math.abs(toIdx - fromIdx),
      dots: [],
      len: 0,
      progress: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEventId, pts]);

  // 窗口尺寸变化时（未在行走中）把旅人钉回当前事件点
  useEffect(() => {
    if (!pts || travel || walkerIdxRef.current == null) return;
    if (walkerIdxRef.current < pts.length) setWalkerPos(pts[walkerIdxRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts]);

  // 行走动画：沿隐藏的旅程路径取点推进，足迹按里程渐次点亮
  useEffect(() => {
    if (!travel || travel.len) return;
    const el = measureRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    if (!len) return;
    const spacing = 26; // 足迹间距（底图像素）
    const dots = [];
    for (let d = spacing * 0.6; d < len - 6; d += spacing) {
      const p = el.getPointAtLength(d);
      dots.push({ x: p.x, y: p.y, at: d / len });
    }
    const duration = Math.min(2600, 900 + 420 * travel.steps);
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((2 - 2 * t) ** 2) / 2);
    const toIdx = travel.toIdx;
    let done = false;
    // 进度按真实时间推导（幂等）：rAF 负责丝滑；标签页转后台时 rAF 会被浏览器
    // 冻结，用 interval 兜底继续推进，避免旅人卡在半路、回到前台再瞬移。
    const advance = () => {
      if (done) return;
      const t = Math.min(1, (performance.now() - start) / duration);
      const p = ease(t);
      const pt = el.getPointAtLength(p * len);
      setWalkerPos({ x: pt.x, y: pt.y });
      setTravel((tr) => (tr ? { ...tr, dots, len, progress: p } : tr));
      if (t >= 1) {
        // 走完落定：这段路留成实墨
        done = true;
        walkerIdxRef.current = toIdx;
        setArrivedYear((y) => Math.max(y ?? -Infinity, events[toIdx].year));
        setTravel(null);
      }
    };
    const tick = () => {
      advance();
      if (!done) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    const fallback = setInterval(advance, 250);
    return () => {
      done = true;
      cancelAnimationFrame(rafRef.current);
      clearInterval(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travel?.key]);

  // 滚轮缩放（手动加非 passive 监听，React 的 onWheel 是 passive 的没法 preventDefault）
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setAnimated(false);
      setView((v) => {
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const k = ns / v.scale;
        return clampView({ scale: ns, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampView]);

  // 拖拽平移（鼠标 + 触屏）+ 双指捏合缩放
  const startDrag = (clientX, clientY) => {
    dragRef.current = { x: clientX, y: clientY, tx0: view.tx, ty0: view.ty, moved: false };
    setAnimated(false);
  };
  const pinchRef = useRef(null);
  const lastTapRef = useRef(0);
  const viewLatestRef = useRef(view);
  viewLatestRef.current = view;
  const startPinch = (touches) => {
    const [a, b] = touches;
    pinchRef.current = {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      scale0: view.scale,
      tx0: view.tx,
      ty0: view.ty,
      cx: (a.clientX + b.clientX) / 2,
      cy: (a.clientY + b.clientY) / 2,
    };
    dragRef.current = null;
    setAnimated(false);
  };
  useEffect(() => {
    const onMove = (e) => {
      if (e.touches && e.touches.length >= 2 && pinchRef.current) {
        const p = pinchRef.current;
        const el = viewportRef.current;
        if (!el) return;
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (dist <= 0 || p.dist <= 0) return;
        const rect = el.getBoundingClientRect();
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale0 * (dist / p.dist)));
        const k = ns / p.scale0;
        const mx = p.cx - rect.left;
        const my = p.cy - rect.top;
        justDraggedRef.current = true;
        setView(() => clampView({ scale: ns, tx: mx - k * (mx - p.tx0), ty: my - k * (my - p.ty0) }));
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      // 触屏手指天然抖动，判定拖拽的阈值放宽，避免点按被误判成拖地图
      const slop = e.touches ? 9 : 4;
      if (Math.abs(cx - d.x) + Math.abs(cy - d.y) > slop) d.moved = true;
      if (d.moved) {
        setView((v) => clampView({ scale: v.scale, tx: d.tx0 + (cx - d.x), ty: d.ty0 + (cy - d.y) }));
      }
    };
    const onUp = (e) => {
      // 捏合中抬起一根手指：剩下的那根无缝转为平移
      if (e.touches && e.touches.length > 0) {
        if (pinchRef.current && e.touches.length === 1) {
          pinchRef.current = null;
          const t = e.touches[0];
          const v = viewLatestRef.current;
          dragRef.current = { x: t.clientX, y: t.clientY, tx0: v.tx, ty0: v.ty, moved: true };
          setTimeout(() => { justDraggedRef.current = false; }, 80);
        }
        return;
      }
      if (dragRef.current?.moved || pinchRef.current) {
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 80);
      } else if (e.changedTouches && dragRef.current) {
        // 触屏双击复位（touchAction:none 下 dblclick 不可靠）
        const now = Date.now();
        if (now - lastTapRef.current < 320) {
          setAnimated(true);
          setView({ scale: 1, tx: 0, ty: 0 });
        }
        lastTapRef.current = now;
      }
      pinchRef.current = null;
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  }, [clampView]);

  const zoomBy = (factor) => {
    const el = viewportRef.current;
    if (!el) return;
    const { width: W, height: H } = el.getBoundingClientRect();
    setAnimated(true);
    setView((v) => {
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = ns / v.scale;
      // 以视口中心为缩放中心
      return clampView({ scale: ns, tx: W / 2 - k * (W / 2 - v.tx), ty: H / 2 - k * (H / 2 - v.ty) });
    });
  };
  const resetView = () => { setAnimated(true); setView({ scale: 1, tx: 0, ty: 0 }); };

  const { scale, tx, ty } = view;

  return (
    <div style={styles.mapContainer}>
      <div
        ref={viewportRef}
        style={{
          ...styles.viewport,
          cursor: dragRef.current?.moved ? "grabbing" : "grab",
          // 触屏手势全部交给地图（平移/捏合），不让浏览器拿去滚动/缩放页面
          touchAction: "none",
        }}
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          if (e.touches.length >= 2) startPinch(e.touches);
          else startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onDoubleClick={resetView}
      >
        <div
          style={{
            ...styles.mapBackground,
            ...(dims ? { width: dims.cw, height: dims.ch } : { width: "100%", height: "100%" }),
            backgroundImage: `url('${asset(mapUrl)}')`,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: animated ? "transform 0.7s cubic-bezier(0.25, 0.8, 0.35, 1)" : "none",
          }}
        >
          {/* 底图密就减淡：每张古地图自带一个减淡系数（mapTheme.scrimBoost） */}
          {mapTheme.scrimBoost > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: paper(mapTheme.scrimBoost),
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── 未至之地的雾：纸色薄雾盖住还没走到的区域，走到就化开 ──
               雾要淡（氛围不是遮挡）；洞用径向渐变羽化，新至之地 700ms 化开；
               旅人脚下带一个随行的化雾圈，走到哪里哪里就亮 ── */}
          {pts && dims && (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${dims.cw} ${dims.ch}`}
              style={styles.fogLayer}
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="gm-fog-hole">
                  <stop offset="0%" stopColor="#000" />
                  <stop offset="62%" stopColor="#000" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#000" stopOpacity="0" />
                </radialGradient>
                <mask id="gm-fog-mask">
                  <rect width={dims.cw} height={dims.ch} fill="#FFF" />
                  {pts.map((p, i) => (
                    <circle
                      key={events[i].id + "-hole"}
                      cx={p.x}
                      cy={p.y}
                      r={Math.min(dims.cw, dims.ch) * 0.17}
                      fill="url(#gm-fog-hole)"
                      style={{
                        opacity: events[i].year <= maxInkYear ? 1 : 0,
                        transition: "opacity 700ms ease",
                      }}
                    />
                  ))}
                  {walkerPos && (
                    <circle
                      cx={walkerPos.x}
                      cy={walkerPos.y}
                      r={Math.min(dims.cw, dims.ch) * 0.2}
                      fill="url(#gm-fog-hole)"
                    />
                  )}
                </mask>
              </defs>
              <rect
                width={dims.cw}
                height={dims.ch}
                fill={paper(1)}
                opacity={0.4}
                mask="url(#gm-fog-mask)"
              />
            </svg>
          )}

          {/* ── 旅程墨线：已走 = 实墨，未走 = 极淡铅笔稿；行走时足迹渐次点亮 ── */}
          {pts && pts.length >= 2 && dims && (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${dims.cw} ${dims.ch}`}
              style={styles.routeLayer}
            >
              {/* 衬线层：底图画面很满，墨线下垫一条纸色亮边才能读出来（制图学 casing） */}
              {pts.slice(0, -1).map((_, i) => {
                const walked = events[i + 1].year <= maxInkYear;
                return (
                  <path
                    key={events[i].id + "-casing"}
                    d={segD(pts, i)}
                    fill="none"
                    stroke={paper(1)}
                    strokeWidth={walked ? 8 : 6.5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    style={{
                      opacity: walked ? 0.8 : 0.6,
                      transition: "opacity 320ms ease",
                    }}
                  />
                );
              })}
              {pts.slice(0, -1).map((_, i) => {
                const walked = events[i + 1].year <= maxInkYear;
                return (
                  <path
                    key={events[i].id + "-seg"}
                    d={segD(pts, i)}
                    fill="none"
                    stroke={walked ? mapTheme.ink : mapTheme.inkFaint}
                    strokeWidth={walked ? 3.2 : 2.2}
                    strokeLinecap="round"
                    strokeDasharray={walked ? undefined : "7 9"}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      opacity: walked ? 0.9 : 0.68,
                      transition: "opacity 320ms ease, stroke 320ms ease",
                    }}
                  />
                );
              })}
              {travel && (
                <>
                  {/* 隐藏的旅程路径：只用来量长度/取点 */}
                  <path ref={measureRef} d={travel.d} fill="none" stroke="none" />
                  {travel.dots.map((d, i) => (
                    <g key={travel.key + "-dot-" + i}
                      style={{
                        opacity: d.at <= travel.progress ? 1 : 0,
                        transition: "opacity 260ms ease",
                      }}
                    >
                      <circle cx={d.x} cy={d.y} r={5.4} fill={paper(1)} opacity={0.7} />
                      <circle cx={d.x} cy={d.y} r={3} fill={mapTheme.ink} opacity={0.85} />
                    </g>
                  ))}
                </>
              )}
            </svg>
          )}

          {events.map((event) => {
            const isCurrent = event.id === currentEventId;
            // 已至/未至跟随墨线的口径：旅人走到过（或存档解锁）即为已至
            const isVisited = !isCurrent && event.year <= maxInkYear;
            // 放大时符号按比例缩小一些，避免遮住地图（保留一点增大感）
            const counter = 1 / Math.sqrt(scale);

            return (
              <button
                key={event.id}
                style={{
                  ...styles.pinWrap,
                  left: `${event.location.mapX}%`,
                  top: `${event.location.mapY}%`,
                  zIndex: isCurrent ? 5 : isVisited ? 3 : 2,
                  transform: `translate(-50%, -100%) scale(${counter})`,
                  transformOrigin: "50% 100%",
                }}
                onClick={() => {
                  if (justDraggedRef.current) return; // 拖拽结束不算点击
                  onEventClick(event);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                title={`${event.year}${t("app.yearSuffix")} · ${t(event.name)}`}
              >
                {/* 文字标签已去掉——底图自带地名/事件字，叠加会重影；悬停有 title 提示。
                    当前事件不画符号，由旅人立绘 + 呼吸高亮代替。 */}
                {!isCurrent && (
                  <MapSymbol kind={mapTheme.pin} theme={mapTheme} state={isVisited ? "visited" : "future"} />
                )}
              </button>
            );
          })}

          {/* 小主角：站在当前事件位置，切换事件时沿墨线走过去 */}
          {walkerPos && (
            <>
              {/* 当前地点的呼吸高亮：脚下一圈朱砂暖光 */}
              <span
                aria-hidden="true"
                style={{
                  ...styles.walkerHalo,
                  left: walkerPos.x,
                  top: walkerPos.y,
                  background: `radial-gradient(ellipse at center, ${alpha(mapTheme.seal, 0.4)} 0%, ${alpha(mapTheme.seal, 0.16)} 55%, ${alpha(mapTheme.seal, 0)} 78%)`,
                  animation: prefersReducedMotion ? "none" : "walkerBreath 2.6s ease-in-out infinite",
                }}
              />
              <img
                src={asset(heroWalkerPath(null, currentEvent?.year))}
                alt=""
                style={{
                  ...styles.walker,
                  left: walkerPos.x,
                  top: walkerPos.y,
                  // 补偿指数用 0.35（比 sqrt 缓）：放大地图时旅人不至于缩得太小；
                  // 行走途中再放大一点，让"人在走"看得清
                  transform: `translate(-50%, -96%) scale(${(travel ? 1.18 : 1) / Math.pow(scale, 0.35)})`,
                  transition: "transform 320ms ease",
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* 缩放控制 */}
      <div style={styles.zoomControls}>
        <button style={styles.zoomBtn} title={t("放大")} onClick={() => zoomBy(1.4)}>{t("＋")}</button>
        <button style={styles.zoomBtn} title={t("缩小")} onClick={() => zoomBy(1 / 1.4)}>{t("－")}</button>
        <button style={styles.zoomBtn} title={t("复位（双击地图也可复位）")} onClick={resetView}>{"⟲"}</button>
      </div>

      {/* 事件前进/后退 */}
      {(() => {
        // 事件卡贴在右边，1280 以下这一对胶囊就会顶到它身上。
        // 窄屏只留年份，全名收进 title。
        const compactSteps = viewportW < 1280;
        const idx = events.findIndex((e) => e.id === currentEventId);
        const prev = idx > 0 ? events[idx - 1] : null;
        const next = idx >= 0 && idx < events.length - 1 ? events[idx + 1] : null;
        return (
          <div style={{
            ...styles.stepControls,
            // 时间轴一展开，上排事件标签就升到 74px 这个高度来——让开
            bottom: timelineExpanded ? 186 : 74,
          }}>
            <button
              style={{ ...styles.stepBtn, opacity: prev ? 1 : 0.4, cursor: prev ? "pointer" : "default" }}
              disabled={!prev}
              title={prev ? `${prev.year} ${t(prev.name)}` : undefined}
              onClick={() => prev && onEventClick(prev)}
            >
              {"\u25C0 " + (prev
                ? (compactSteps ? String(prev.year) : `${prev.year} ${t(prev.name)}`)
                : t("已是起点"))}
            </button>
            <button
              style={{ ...styles.stepBtn, opacity: next ? 1 : 0.4, cursor: next ? "pointer" : "default" }}
              disabled={!next}
              title={next ? `${next.year} ${t(next.name)}` : undefined}
              onClick={() => next && onEventClick(next)}
            >
              {(next
                ? (compactSteps ? String(next.year) : `${next.year} ${t(next.name)}`)
                : t("已是终点")) + " \u25B6"}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export function Pin({ color, size, glow, badge }) {
  const w = size;
  const h = (size * 4) / 3;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 32"
      style={{
        display: "block",
        filter: glow
          ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 2px 3px rgba(0,0,0,0.4))`
          : "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
        transition: "all 0.3s ease",
      }}
    >
      <path
        d="M12 0.8 C5.8 0.8 0.8 5.8 0.8 12 c0 8.3 9.5 18.4 10.7 19.6 c0.3 0.3 0.7 0.3 1 0 C13.7 30.4 23.2 20.3 23.2 12 c0-6.2-5-11.2-11.2-11.2 z"
        fill={color}
        stroke="white"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="4.5" fill="white" />
      {badge && (
        <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="bold" fill={color}>
          {badge}
        </text>
      )}
    </svg>
  );
}

const styles = {
  mapContainer: {
    flex: 1,
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    padding: 0,
    minHeight: "min(400px, var(--vh100))",
  },
  // 视口：全宽通栏，底图 cover 铺满，可平移缩放
  viewport: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    touchAction: "none",
  },
  mapBackground: {
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    position: "relative",
    transformOrigin: "0 0",
    willChange: "transform",
  },
  fogLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  routeLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "visible",
    zIndex: 1,
  },
  pinWrap: {
    position: "absolute",
    background: "none",
    border: "none",
    // 触控命中区外扩（视觉尺寸不变，符号周围 10px 也可点中）
    padding: 10,
    margin: -10,
    cursor: "pointer",
    touchAction: "manipulation",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    transition: "opacity 0.25s ease",
  },
  walker: {
    position: "absolute",
    height: 90,
    zIndex: 8,
    pointerEvents: "none",
    transformOrigin: "50% 100%",
    // 当前态的落影比普通符号更重
    filter: "drop-shadow(0 6px 12px rgba(40,25,10,0.45))",
  },
  // 旅人脚下的呼吸暖光（当前地点的高亮）
  walkerHalo: {
    position: "absolute",
    width: 70,
    height: 26,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 7,
    pointerEvents: "none",
  },
  stepControls: {
    position: "absolute",
    // 原来是 left:50% + translateX(-50%)，在窄屏上会顶到右边那张事件卡。
    // 事件卡是**定宽**的（实测各分辨率下都占右侧约 378px），
    // 所以这里不居中于整屏，而是居中于「卡片左边剩下的那块」——
    // 任何宽度下都不会撞上，也不用为它单开断点。
    left: 0,
    right: 400,
    // 让开挂在地图底部的时间轴细带
    bottom: 74,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    zIndex: 20,
  },
  stepBtn: {
    padding: "8px 16px",
    maxWidth: 300,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    borderRadius: 18,
    border: `1px solid ${COLOR.goldLineSoft}`,
    backgroundColor: paperBtn(0.92),
    color: COLOR.btnTextSub,
    fontSize: "clamp(12px, 0.903vw, 14.9px)",
    fontFamily: FONT,
    boxShadow: SHADOW.chip,
    letterSpacing: TRACKING.tight,
    cursor: "pointer",
    whiteSpace: "nowrap",
    // 窄屏两枚并排放不下完整「年份+事件名」时截断而不是溢出屏幕
    maxWidth: "42vw",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minHeight: 40,
    touchAction: "manipulation",
  },
  zoomControls: {
    position: "absolute",
    right: 26,
    // 让开挂在地图底部的时间轴细带
    bottom: 74,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    zIndex: 20,
  },
  // 主页同款小胶囊：纸底 + 金线描边的圆钮
  zoomBtn: {
    width: 40,
    height: 40,
    touchAction: "manipulation",
    borderRadius: "50%",
    border: `1px solid ${COLOR.goldLineSoft}`,
    backgroundColor: paperBtn(0.92),
    fontSize: "clamp(13.6px, 1.181vw, 19.5px)",
    cursor: "pointer",
    boxShadow: SHADOW.chip,
    color: COLOR.btnTextSub,
    lineHeight: 1,
    fontFamily: FONT,
  },
};

// Inject keyframes once：mapPinPulse 供 ScenePlayer 的 map_travel 沿用，
// walkerBreath 是地图页当前地点的呼吸高亮
if (typeof document !== "undefined" && !document.getElementById("map-pin-pulse-keyframes")) {
  const style = document.createElement("style");
  style.id = "map-pin-pulse-keyframes";
  style.textContent = `
    @keyframes mapPinPulse {
      0% { transform: translate(-50%, 0) scale(0.6); opacity: 0.5; }
      100% { transform: translate(-50%, 0) scale(2.2); opacity: 0; }
    }
    @keyframes walkerBreath {
      0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.95; transform: translate(-50%, -50%) scale(1.14); }
    }
  `;
  document.head.appendChild(style);
}
