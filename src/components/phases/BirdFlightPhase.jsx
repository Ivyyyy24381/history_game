// ============================================================
// BIRD FLIGHT — 带鸟群飞过七个山谷（鲁米 · 1220 内沙布尔：阿塔尔《百鸟会议》）
// ============================================================
// 阿塔尔讲给孩子鲁米的故事：世上所有的鸟去找它们的王——神鸟西摩格。
// 戴胜鸟领路，要飞过七个山谷。有的鸟找借口掉队；在阿塔尔的原诗里，
// 更多的鸟死在路上——渴死、淹死、被烧死、被野兽吃掉——最后只剩三十只。
//
// 玩法：你是戴胜鸟。鼠标带路，一群鸟跟着你飞；按住鼠标（或空格）= 收拢翅膀冲刺。
// 每个山谷一种飞法，飞法本身就是那个山谷的意思：
//   求索 · pillars   从岩柱的缝里穿过去（找路要费力气）
//   爱   · fire      火墙躲不开，只能冲过去（爱不讲道理）——按住冲刺，烧掉的少
//   知识 · orbs      去收集散落的光（每只鸟看见的路不一样）——收集到的光会让寂灭之谷那一线光更宽
//   超脱 · treasure  金子宝石飘过来，碰到的鸟会跟着它走（什么都不再需要）
//   合一 · gust      阵风要来——按住把鸟群收拢，散开的会被吹走（许多，其实是一）
//   惊愕 · invert    上下颠倒，还有漂浮的石头（你不再知道自己知道什么）
//   寂灭 · dark      一片漆黑，只有一线光（让「我」消失）
// 飞到湖边：先猜「西摩格在哪里」，再低头看湖——三十只鸟的倒影拼成一只大鸟。
// 不管玩家飞得多好或多糟，到湖边一定正好剩三十只（原诗如此）：路上损失有下限保护，多出来的在最后的黑暗里散去。
//
// phase: {
//   legend?, situation,
//   valleys: [{ name, line, tip, kind, sky: [top, bottom], hills: [far, mid, near], leave, excuse: { bird, text, reply } }],
//   startBirds = 100,
//   question, options: [{ id, text }], actual, reveal, consequence, artCard?
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";
import ArtCard from "./ArtCard";

const VALLEY_LEN = 1.8;              // 每个山谷有多长（屏宽）
const SPEED = 0.24;                  // 屏宽 / 秒
const DASH = 1.9;                    // 按住时的速度倍数
const FINAL = 30;
const VALLEY_CAP = 7;                // 每谷最多因障碍损失几只
const LAKE_COLORS = { sky: ["#F2D9A6", "#9CC3C0"], hills: ["#8FA9A3", "#6C8B86", "#4E6E68"] };
const BIRD_COLORS = ["#6B4A2E", "#3F7A3A", "#2F5D8A", "#2F6F6B", "#B4762F", "#7A7A74", "#E8E2D6", "#3A2E28", "#A8865A", "#8A3A3A"];
const CAUSE = { rock: "撞上岩石", fire: "被火烧", treasure: "跟着金子走了", wind: "被风吹散", stone: "撞上浮石", dark: "消失在黑暗里", excuse: "找借口离开" };

// 按山谷种类在世界坐标里摆障碍（x：屏宽单位，从山谷起点 x0 算；y：屏高比例）
function makeObstacles(kind, x0, rnd) {
  const obs = [];
  const span = (a, b) => x0 + a + rnd() * (b - a);
  if (kind === "pillars") {
    for (let x = x0 + 0.55; x < x0 + VALLEY_LEN - 0.2; x += 0.42) {
      const gy = 0.3 + rnd() * 0.4, gh = 0.34;
      obs.push({ k: "rock", x, w: 0.065, y0: 0, y1: gy - gh / 2 });
      obs.push({ k: "rock", x, w: 0.065, y0: gy + gh / 2, y1: 1 });
    }
  } else if (kind === "fire") {
    obs.push({ k: "fire", x: x0 + 0.6, w: 0.17 });
    obs.push({ k: "fire", x: x0 + 1.3, w: 0.17 });
  } else if (kind === "orbs") {
    for (let i = 0; i < 12; i++) obs.push({ k: "orb", x: span(0.45, VALLEY_LEN - 0.15), y: 0.18 + rnd() * 0.64, r: 0.022, ph: rnd() * 6 });
  } else if (kind === "treasure") {
    for (let i = 0; i < 9; i++) obs.push({ k: "treasure", gem: i % 3 === 0, x: span(0.5, VALLEY_LEN - 0.1), y: 0.2 + rnd() * 0.6, r: 0.028, ph: rnd() * 6 });
  } else if (kind === "gust") {
    [0.7, 1.15, 1.6].forEach((a) => obs.push({ k: "gust", x: x0 + a, warned: false, blown: false }));
  } else if (kind === "invert") {
    for (let i = 0; i < 7; i++) obs.push({ k: "stone", x: span(0.5, VALLEY_LEN - 0.1), y: 0.2 + rnd() * 0.6, r: 0.038, ph: rnd() * 6 });
  }
  return obs;
}
const darkCenter = (wx) => 0.5 + 0.26 * Math.sin(wx * 3.1) * Math.cos(wx * 1.3);
// 寂灭之谷那一线光有多宽：知识之谷收集到的光越多，最后的路越亮
const darkHalf = (orbs) => 0.1 + Math.min(12, orbs) * 0.01;

// 西摩格的轮廓：三十个点——头颈 2、身体 4、左翼 8、右翼 8、尾羽 8（两股各 4）。
// 单位长度 = 画布上的 L 像素，y 向下为正；正面看、双翼展开、长尾下垂。
function simorghPoints() {
  const pts = [[0, -0.105], [0, -0.078]];
  for (let i = 0; i < 4; i++) pts.push([0, -0.05 + i * 0.03]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const a = (i + 1) / 8;
      pts.push([side * (0.025 + a * 0.2), -0.045 - Math.sin(a * Math.PI * 0.85) * 0.07 + a * a * 0.06]);
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) pts.push([side * (0.012 + i * 0.016), 0.07 + i * 0.03]);
  }
  return pts;
}
// 连线顺序（下标区间），用来描出轮廓
const SIMORGH_CHAINS = [[0, 6], [2, 3, 6, 7, 8, 9, 10, 11, 12, 13], [2, 3, 14, 15, 16, 17, 18, 19, 20, 21], [5, 22, 23, 24, 25], [5, 26, 27, 28, 29]];

function lerpColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb);
  const r = Math.round(r1 + (r2 - r1) * k), g = Math.round(g1 + (g2 - g1) * k), bl = Math.round(b1 + (b2 - b1) * k);
  return `rgb(${r},${g},${bl})`;
}

export default function BirdFlightPhase({ phase, onScore, onComplete }) {
  const valleys = phase.valleys || [];
  const startBirds = phase.startBirds || 100;
  const options = phase.options || [];
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(0);        // 0 飞 · 1 猜 · 2 看湖 · 3 后来
  const [valleyIdx, setValleyIdx] = useState(-1);
  const [excuse, setExcuse] = useState(null); // { bird, text, reply, open }
  const [left, setLeft] = useState(startBirds);
  const [toast, setToast] = useState(null);   // { text, key }
  const [gustWarn, setGustWarn] = useState(false);
  const [orbs, setOrbs] = useState(0);
  const [lost, setLost] = useState({});       // cause → n
  const [mine, setMine] = useState(null);
  const stage = useRef(null);
  const canvas = useRef(null);
  const S = useRef(null);                     // 可变的模拟状态（每帧改，不走 React）
  const stepRef = useRef(0);
  stepRef.current = step;

  if (!S.current) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const birds = [];
    for (let i = 0; i < startBirds; i++) {
      birds.push({
        x: 0.1 + rnd() * 0.2, y: 0.3 + rnd() * 0.4, vx: 0, vy: 0,
        ox: -0.03 - rnd() * 0.2, oy: (rnd() - 0.5) * 0.3,   // 跟在戴胜身后的队形偏移
        ph: rnd() * Math.PI * 2, c: BIRD_COLORS[i % BIRD_COLORS.length],
        out: 0, cause: null, gone: false, darkT: 0, kick: 0,
      });
    }
    const obs = [];
    valleys.forEach((v, i) => obs.push(...makeObstacles(v.kind, i * VALLEY_LEN, rnd)));
    S.current = { birds, obs, hx: 0.3, hy: 0.5, tx: 0.3, ty: 0.5, dist: 0, hold: false, lastValley: -1, lakeAt: 0, lost: {}, orbs: 0 };
  }

  // —— 操作 ——
  const aim = (e) => {
    const r = stage.current.getBoundingClientRect();
    S.current.tx = Math.max(0.12, Math.min(0.58, (e.clientX - r.left) / r.width));
    S.current.ty = Math.max(0.08, Math.min(0.92, (e.clientY - r.top) / r.height));
  };
  const onMove = (e) => { if (stepRef.current === 0) aim(e); };
  const onDown = (e) => { if (stepRef.current === 0) { aim(e); S.current.hold = true; } };
  const onUp = () => { S.current.hold = false; };
  const onKey = (e, down) => {
    const s = S.current, d = 0.05;
    if (e.key === " ") { s.hold = down; e.preventDefault(); return; }
    if (!down) return;
    if (e.key === "ArrowUp") s.ty = Math.max(0.08, s.ty - d);
    else if (e.key === "ArrowDown") s.ty = Math.min(0.92, s.ty + d);
    else if (e.key === "ArrowLeft") s.tx = Math.max(0.12, s.tx - d);
    else if (e.key === "ArrowRight") s.tx = Math.min(0.58, s.tx + d);
    else return;
    e.preventDefault();
  };

  useEffect(() => {
    let raf = 0, prev = performance.now();
    const total = valleys.length * VALLEY_LEN;
    // 还要为后面的「借口离开」留够鸟：路上的损失不能把鸟群打到这条线以下
    const floorAt = (vi) => FINAL + valleys.slice(vi + 1).reduce((n, v) => n + (v.leave || 0), 0);

    const tick = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const s = S.current, cv = canvas.current, el = stage.current;
      if (!cv || !el) { raf = requestAnimationFrame(tick); return; }
      const W = el.clientWidth, H = el.clientHeight, AR = H / W;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const st = stepRef.current;
      if (st === 0 && s.dist < total) s.dist = Math.min(total, s.dist + SPEED * (s.hold ? DASH : 1) * dt);
      const atLake = s.dist >= total;
      const vi = Math.min(valleys.length - 1, Math.floor(s.dist / VALLEY_LEN));
      const within = (s.dist % VALLEY_LEN) / VALLEY_LEN;
      const kind = atLake ? "lake" : valleys[vi].kind;
      const alive = () => s.birds.filter((b) => !b.out && !b.gone);
      const lose = (b, cause) => {
        if (b.out) return false;
        if (cause !== "excuse" && cause !== "dark_final") {
          if (alive().length <= floorAt(vi)) return false;
          // 每个山谷最多损失 VALLEY_CAP 只：第一谷飞得再糟，后面几谷也照样有东西可失去
          s.vLoss = s.vLoss || {};
          if ((s.vLoss[vi] || 0) >= VALLEY_CAP) return false;
          s.vLoss[vi] = (s.vLoss[vi] || 0) + 1;
        }
        b.out = 0.001; b.cause = cause === "dark_final" ? "dark" : cause;
        s.lost[b.cause] = (s.lost[b.cause] || 0) + 1;
        return true;
      };
      const say = (text) => setToast({ text, key: now });

      // 进入新山谷：一群鸟找借口离开
      if (st === 0 && !atLake && vi !== s.lastValley) {
        s.lastValley = vi;
        setValleyIdx(vi);
        const v = valleys[vi];
        const stay = alive();
        const n = Math.min(v.leave || 0, Math.max(0, stay.length - FINAL));
        for (let k = 0; k < n; k++) lose(stay[stay.length - 1 - k], "excuse");
        if (v.excuse) setExcuse({ ...v.excuse, open: false });
      }
      // 到湖边：多出来的在最后的黑暗里散去，正好剩三十只
      if (st === 0 && atLake && !s.lakeAt) {
        s.lakeAt = now;
        const stay = alive();
        for (let k = FINAL; k < stay.length; k++) lose(stay[k], "dark_final");
        setExcuse(null); setValleyIdx(valleys.length); setGustWarn(false);
        setLost({ ...s.lost }); setOrbs(s.orbs); setLeft(FINAL);
      }
      if (st === 0 && atLake && now - s.lakeAt > 2200 && !s.asked) { s.asked = true; setStep(1); }

      // —— 天空与山 ——
      const cur = atLake || !valleys[vi] ? LAKE_COLORS : valleys[vi];
      const nxt = atLake ? LAKE_COLORS : (valleys[vi + 1] || LAKE_COLORS);
      const kk = atLake ? 0 : Math.max(0, (within - 0.8) / 0.2);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, lerpColor(cur.sky[0], nxt.sky[0], kk));
      sky.addColorStop(1, lerpColor(cur.sky[1], nxt.sky[1], kk));
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const scroll = s.dist * W;
      [0.2, 0.45, 0.8].forEach((par, li) => {
        g.fillStyle = lerpColor(cur.hills[li], nxt.hills[li], kk);
        g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
          const wx = (x + scroll * par) / W;
          const base = H * (0.7 + li * 0.09);
          const y = base - (Math.sin(wx * 5.1 + li) * 0.06 + Math.sin(wx * 11.3 + li * 2) * 0.03 + Math.sin(wx * 2.3) * 0.04) * H * (1.1 - li * 0.25);
          g.lineTo(x, y);
        }
        g.lineTo(W, H); g.closePath(); g.fill();
      });

      // —— 戴胜 ——
      if (st === 0 && !atLake) {
        const ty = kind === "invert" ? 1 - s.ty : s.ty;   // 惊愕之谷：上下颠倒
        s.hx += (s.tx - s.hx) * 0.09; s.hy += (ty - s.hy) * 0.09;
      }
      if (atLake) { s.hx += (0.5 - s.hx) * 0.04; s.hy += (0.34 - s.hy) * 0.04; }

      // —— 障碍：画 + 碰撞 ——
      const toScreen = (wx) => wx - s.dist + 0.0;   // 世界 x → 屏幕 x（屏宽单位）
      for (const o of s.obs) {
        const sx = toScreen(o.x);
        if (sx < -0.3 || sx > 1.3) continue;
        const X = sx * W;
        if (o.k === "rock") {
          const y0 = o.y0 * H, y1 = o.y1 * H, w = o.w * W;
          const rg = g.createLinearGradient(X, 0, X + w, 0);
          rg.addColorStop(0, "#6B4E32"); rg.addColorStop(0.5, "#8E6A44"); rg.addColorStop(1, "#4E3824");
          g.fillStyle = rg;
          g.beginPath();
          if (o.y0 === 0) { g.moveTo(X, 0); g.lineTo(X + w, 0); g.lineTo(X + w * 0.8, y1); g.lineTo(X + w * 0.5, y1 + 10); g.lineTo(X + w * 0.2, y1); }
          else { g.moveTo(X, H); g.lineTo(X + w, H); g.lineTo(X + w * 0.85, y0); g.lineTo(X + w * 0.45, y0 - 12); g.lineTo(X + w * 0.15, y0); }
          g.closePath(); g.fill();
        } else if (o.k === "fire") {
          const w = o.w * W;
          const fg = g.createLinearGradient(X, 0, X + w, 0);
          fg.addColorStop(0, "rgba(255,120,40,0)"); fg.addColorStop(0.5, "rgba(255,110,30,0.55)"); fg.addColorStop(1, "rgba(255,120,40,0)");
          g.fillStyle = fg; g.fillRect(X, 0, w, H);
          for (let y = 0; y < H; y += 26) {
            const f = reduced ? 0.5 : (Math.sin(now / 90 + y * 0.13 + o.x * 9) + 1) / 2;
            g.fillStyle = `rgba(255,${150 + Math.round(f * 80)},60,${0.35 + 0.35 * f})`;
            g.beginPath(); g.ellipse(X + w / 2 + Math.sin(y + now / 200) * w * 0.2, y, w * 0.18 + f * 8, 16, 0, 0, Math.PI * 2); g.fill();
          }
        } else if (o.k === "orb" && !o.got) {
          const r = o.r * W * (1 + 0.15 * Math.sin(now / 300 + o.ph));
          const og = g.createRadialGradient(X, o.y * H, 0, X, o.y * H, r * 2.2);
          og.addColorStop(0, "rgba(255,255,235,0.95)"); og.addColorStop(0.4, "rgba(255,230,150,0.6)"); og.addColorStop(1, "rgba(255,230,150,0)");
          g.fillStyle = og; g.beginPath(); g.arc(X, o.y * H, r * 2.2, 0, Math.PI * 2); g.fill();
        } else if (o.k === "treasure" && !o.taken) {
          const Y = (o.y + Math.sin(now / 700 + o.ph) * 0.03) * H, r = o.r * W;
          o.cy = Y / H;
          if (o.gem) {
            g.fillStyle = "#3FB6C9"; g.strokeStyle = "#E6FBFF"; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(X, Y - r); g.lineTo(X + r * 0.8, Y); g.lineTo(X, Y + r); g.lineTo(X - r * 0.8, Y); g.closePath(); g.fill(); g.stroke();
          } else {
            g.fillStyle = "#E9C46A"; g.strokeStyle = "#8A6A1E"; g.lineWidth = 2;
            g.beginPath(); g.arc(X, Y, r * 0.8, 0, Math.PI * 2); g.fill(); g.stroke();
            g.beginPath(); g.arc(X, Y, r * 0.5, 0, Math.PI * 2); g.stroke();
          }
          if (!reduced && Math.sin(now / 160 + o.ph) > 0.8) { g.fillStyle = "#FFFFFF"; g.fillRect(X + r * 0.3, Y - r * 0.6, 3, 3); }
        } else if (o.k === "stone") {
          const Y = (o.y + Math.sin(now / 900 + o.ph) * 0.05) * H, r = o.r * W;
          o.cy = Y / H;
          const sg = g.createRadialGradient(X - r * 0.3, Y - r * 0.3, r * 0.1, X, Y, r);
          sg.addColorStop(0, "#A9A2B8"); sg.addColorStop(1, "#4E4660");
          g.fillStyle = sg; g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill();
        } else if (o.k === "gust" && st === 0) {
          const hsx = s.hx; // 以戴胜的位置为准：阵风到了戴胜那一刻刮起来
          if (!o.warned && sx - hsx < 0.35) { o.warned = true; setGustWarn(true); }
          if (!o.blown && sx - hsx < 0) {
            o.blown = true; setGustWarn(false); s.windAt = now;
            const tight = s.hold ? 0.25 : 1;
            for (const b of alive()) { b.kick = 0.9; b.vx += (Math.random() * 0.25 + 0.1) * tight; b.vy += (Math.random() - 0.5) * 0.5 * tight; }
          }
        }
      }

      // 阵风的风痕
      if (s.windAt && now - s.windAt < 1100 && !reduced) {
        const a = 1 - (now - s.windAt) / 1100;
        g.strokeStyle = `rgba(255,255,255,${0.55 * a})`; g.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          const y = ((i * 0.137) % 1) * H, x = ((i * 0.31 + (now - s.windAt) / 500) % 1.2) * W;
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 40, y - 8, x + 90, y + 8, x + 150, y); g.stroke();
        }
      }

      // 惊愕之谷的雾
      if (kind === "invert" && !reduced) {
        for (let i = 0; i < 6; i++) {
          const fx = ((i * 0.23 + now / 9000) % 1.2 - 0.1) * W, fy = (0.2 + 0.12 * i) * H;
          const fg = g.createRadialGradient(fx, fy, 0, fx, fy, W * 0.18);
          fg.addColorStop(0, "rgba(240,235,255,0.35)"); fg.addColorStop(1, "rgba(240,235,255,0)");
          g.fillStyle = fg; g.fillRect(fx - W * 0.2, fy - W * 0.2, W * 0.4, W * 0.4);
        }
      }

      // —— 鸟群 ——
      const flock = alive();
      const pts = simorghPoints();
      const spread = s.hold ? 0.45 : 1;
      flock.forEach((b, i) => {
        let tx, ty;
        if (atLake && st >= 2 && i < FINAL) { tx = 0.2 + (i / (FINAL - 1)) * 0.6; ty = 0.58 + Math.sin(i * 1.7) * 0.02; }
        else if (atLake) { tx = 0.5 + b.ox * 1.2 + 0.1; ty = 0.34 + b.oy * 0.7; }
        else { tx = s.hx + b.ox * spread; ty = s.hy + b.oy * spread * (0.6 + 0.4 * Math.sin(now / 900 + b.ph)); }
        const pull = b.kick > 0 ? 0.6 : 2.4;
        b.kick = Math.max(0, b.kick - dt);
        b.vx += (tx - b.x) * pull * dt + (Math.random() - 0.5) * 0.02 * dt;
        b.vy += (ty - b.y) * pull * dt + (Math.random() - 0.5) * 0.02 * dt;
        b.vx *= 0.93; b.vy *= 0.93;
        b.x += b.vx * dt * 6; b.y += b.vy * dt * 6;
        if (st !== 0 || atLake) return;
        // 碰撞（每只鸟各算各的——鸟群拖得太长，尾巴就会撞上）
        for (const o of s.obs) {
          const sx = toScreen(o.x);
          if (sx < -0.2 || sx > 1.2) continue;
          if (o.k === "rock" && b.x > sx && b.x < sx + o.w && b.y > o.y0 && b.y < o.y1) { if (lose(b, "rock")) say(t("撞上岩石！")); break; }
          if (o.k === "fire" && b.x > sx && b.x < sx + o.w) {
            if (Math.random() < (s.hold ? 0.12 : 0.9) * dt) { if (lose(b, "fire")) say(t("被火烧！")); }
            break;
          }
          if (o.k === "orb" && !o.got && Math.hypot(b.x - sx, (b.y - o.y) * AR) < o.r * 1.6) { o.got = true; s.orbs++; say(t("收集到一点光")); }
          if (o.k === "treasure" && !o.taken && Math.hypot(b.x - sx, (b.y - (o.cy || o.y)) * AR) < o.r) {
            if (lose(b, "treasure")) { o.taken = true; say(t("有鸟跟着金子走了")); }
          }
          if (o.k === "stone" && Math.hypot(b.x - sx, (b.y - (o.cy || o.y)) * AR) < o.r) { if (lose(b, "stone")) say(t("撞上浮石！")); break; }
        }
        // 阵风过后还离得太远的，被吹散
        if (b.kick > 0 && b.kick < 0.4 && Math.hypot(b.x - s.hx, (b.y - s.hy) * AR) > 0.36) { if (lose(b, "wind")) say(t("被风吹散了")); }
        // 黑暗：离开那一线光太久
        if (kind === "dark") {
          const c = darkCenter(s.dist + b.x);
          if (Math.abs(b.y - c) > darkHalf(s.orbs)) { b.darkT += dt; if (b.darkT > 0.7 && lose(b, "dark")) say(t("消失在黑暗里")); }
          else b.darkT = 0;
        }
        if (b.y < -0.05 || b.y > 1.05) { if (lose(b, "rock")) say(t("撞上岩石！")); }
      });
      // 掉队 / 落下的鸟
      for (const b of s.birds) {
        if (b.out && !b.gone) {
          b.out += dt;
          if (b.cause === "excuse" || b.cause === "treasure") { b.vy += 0.05 * dt; b.vx -= 0.06 * dt; }
          else { b.vy += 0.25 * dt; b.vx -= 0.02 * dt; }
          b.x += b.vx * dt * 6; b.y += b.vy * dt * 6;
          if (b.out > 3 || b.y > 1.15) b.gone = true;
        }
      }
      if (st === 0 && !atLake) {
        const n = alive().length;
        if (n !== s.lastLeft) { s.lastLeft = n; setLeft(n); }
      }

      // —— 画鸟 ——
      const drawBird = (x, y, c, size, ph, alpha = 1) => {
        const flap = reduced ? 0.5 : Math.sin(now / (s.hold ? 70 : 110) + ph);
        g.strokeStyle = c; g.globalAlpha = alpha; g.lineWidth = Math.max(1.4, size * 0.28);
        g.beginPath();
        g.moveTo(x - size, y - size * 0.5 * flap);
        g.quadraticCurveTo(x - size * 0.4, y - size * 0.2, x, y);
        g.quadraticCurveTo(x + size * 0.4, y - size * 0.2, x + size, y - size * 0.5 * flap);
        g.stroke(); g.globalAlpha = 1;
      };
      const size = Math.max(4, W * 0.006);
      for (const b of s.birds) {
        if (b.gone) continue;
        drawBird(b.x * W, b.y * H, b.out && b.cause === "fire" ? "#3A2418" : b.c, size, b.ph, b.out ? Math.max(0, 1 - b.out / 3) : 1);
      }
      if (!atLake || st < 2) {
        const hx = s.hx * W, hy = s.hy * H;
        drawBird(hx, hy, "#C9793A", size * 2, 0);
        g.fillStyle = "#E3A24E";
        g.beginPath(); g.moveTo(hx - 2, hy - 3); g.lineTo(hx + 4, hy - size * 2.2); g.lineTo(hx + 7, hy - 2); g.closePath(); g.fill();
      }

      // 寂灭之谷：除了那一线光，全是黑的（画在鸟上面）
      if (kind === "dark") {
        const fadeIn = Math.min(1, within * 6), fadeOut = Math.min(1, (1 - within) * 8);
        const a = 0.93 * Math.min(fadeIn, fadeOut);
        g.fillStyle = `rgba(6,8,16,${a})`;
        for (let x = 0; x < W; x += 6) {
          const c = darkCenter(s.dist + x / W) * H, hw = darkHalf(s.orbs) * H;
          g.fillRect(x, 0, 6, Math.max(0, c - hw));
          g.fillRect(x, c + hw, 6, H - c - hw);
        }
      }

      // —— 湖 + 倒影 ——
      if (atLake) {
        const lakeTop = H * 0.66;
        const lg = g.createLinearGradient(0, lakeTop, 0, H);
        lg.addColorStop(0, "#7FB0AE"); lg.addColorStop(1, "#2E5B63");
        g.fillStyle = lg; g.fillRect(0, lakeTop, W, H - lakeTop);
        g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
        for (let r = 0; r < 6; r++) { g.beginPath(); g.moveTo(W * 0.1, lakeTop + 14 + r * 22); g.lineTo(W * 0.9, lakeTop + 14 + r * 22); g.stroke(); }
        const shown = flock.slice(0, FINAL);
        shown.forEach((b) => drawBird(b.x * W, b.y * H, b.c, size, b.ph));
        if (st >= 2) {
          s.reflT = (s.reflT || 0) + dt;
          const m = Math.min(1, s.reflT / 3.2);
          const lakeH = H - lakeTop, cx = W * 0.5, cy = lakeTop + lakeH * 0.42;
          const L = Math.min(W * 0.55, lakeH * 2.6);
          const P = shown.map((b, i) => {
            const rx = b.x * W, ry = lakeTop + (lakeTop - b.y * H) + 6;
            const [px, py] = pts[i % pts.length];
            const sx = cx + px * L, sy = cy + py * L;
            return [rx + (sx - rx) * m, ry + (sy - ry) * m];
          });
          if (m > 0.55) {
            const a = Math.min(1, (m - 0.55) * 2.2);
            g.strokeStyle = `rgba(245,210,130,${0.75 * a})`; g.lineWidth = 1.6;
            g.shadowColor = "rgba(245,210,130,0.8)"; g.shadowBlur = 10 * a;
            for (const ch of SIMORGH_CHAINS) {
              const idx = ch.length === 2 ? Array.from({ length: ch[1] - ch[0] }, (_, q) => ch[0] + q) : ch;
              g.beginPath();
              idx.forEach((q, j) => { const pt = P[q]; if (!pt) return; j === 0 ? g.moveTo(pt[0], pt[1]) : g.lineTo(pt[0], pt[1]); });
              g.stroke();
            }
            g.shadowBlur = 0;
          }
          P.forEach(([x, y], i) => drawBird(x, y, m > 0.9 ? "#F5D282" : shown[i].c, size, shown[i].ph, 0.75));
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valleys, reduced]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 1100);
    return () => clearTimeout(id);
  }, [toast]);

  const commit = (id) => {
    setMine(id);
    setStep(2);
    if (onScore) onScore("predict", POINTS.predict);
  };

  const v = valleyIdx >= 0 && valleyIdx < valleys.length ? valleys[valleyIdx] : null;
  const actual = options.find((o) => o.id === phase.actual) || {};
  const chosen = options.find((o) => o.id === mine) || {};
  const lostText = Object.entries(lost).filter(([, n]) => n > 0)
    .map(([c, n]) => `${t(CAUSE[c] || c)} ${n}`).join(" · ");

  return (
    <div style={kit.outer}>
      <div ref={stage} tabIndex={0}
        onKeyDown={(e) => onKey(e, true)} onKeyUp={(e) => onKey(e, false)}
        onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
        aria-label={t("用方向键带着鸟群飞，按住空格冲刺")}
        style={{ ...kit.stage, outline: "none", touchAction: "none", cursor: step === 0 ? "none" : "default" }}>
        <canvas ref={canvas} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        <div style={bf.top}>
          {step === 0 && valleyIdx <= 0 && phase.situation && <div style={{ ...kit.situation, maxWidth: 760, padding: "6px 16px", borderRadius: 10, backgroundColor: "rgba(20,15,10,0.5)" }}>{nb(phase.situation)}</div>}
          {step === 0 && v && (
            <div key={valleyIdx} style={{ ...bf.valley, animation: reduced ? "none" : "bfIn 900ms ease" }}>
              <span style={bf.vNum}>{t("第 {n} 谷").replace("{n}", String(valleyIdx + 1))}</span>
              <span style={bf.vName}>{nb(v.name)}</span>
              {v.line && <span style={bf.vLine}>{nb(v.line)}</span>}
              {v.tip && <span style={bf.vTip}>{nb(v.tip)}</span>}
            </div>
          )}
          {step === 0 && gustWarn && <div style={bf.gust}>{t("风要来了！按住，把鸟群收拢——")}</div>}
        </div>

        <div style={bf.count}>{t("鸟")}{"　"}<b style={{ fontVariantNumeric: "tabular-nums" }}>{left}</b></div>
        {step === 0 && toast && <div key={toast.key} style={{ ...bf.toast, animation: reduced ? "none" : "bfToast 1.1s ease forwards" }}>{nb(toast.text)}</div>}

        {step === 0 && excuse && (
          <div style={bf.excuse} aria-live="polite">
            <div><span style={bf.bird}>{nb(excuse.bird)}</span>{nb(excuse.text)}</div>
            {excuse.open
              ? <div style={bf.reply}><span style={bf.bird}>{t("戴胜")}</span>{nb(excuse.reply)}</div>
              : <button style={bf.ask} onPointerDown={(e) => e.stopPropagation()} onClick={() => setExcuse({ ...excuse, open: true })}>{t("戴胜怎么回？")}</button>}
          </div>
        )}
        {step === 0 && valleyIdx === 0 && <div style={bf.hint}>{t("你是戴胜鸟。移动鼠标带路；按住鼠标 = 收拢翅膀冲刺。")}</div>}

        {step === 1 && (
          <div style={bf.panel}>
            {lostText && <div style={bf.lost}>{nb(t("一路上失去的：") + lostText)}</div>}
            {orbs > 0 && <div style={bf.lost}>{nb(t("你在知识之谷收集的光：{n} 点——它们照亮了最后那一谷的路。").replace("{n}", String(orbs)))}</div>}
            <div style={kit.question}>{nb(phase.question)}</div>
            <div style={kit.opts}>
              {options.map((o) => <button key={o.id} style={kit.opt} onClick={() => commit(o.id)}>{nb(o.text)}</button>)}
            </div>
            <div style={kit.hint}>{t("先猜，再低头看湖。")}</div>
          </div>
        )}
        {step >= 2 && (
          <div style={{ ...bf.panel, top: 0, paddingTop: "max(3%, 48px)", background: "linear-gradient(to bottom, rgba(10,7,4,0.9), rgba(10,7,4,0.7) 70%, rgba(10,7,4,0))", maxHeight: "52%", animation: reduced ? "none" : "bfIn 1.2s ease 3.4s both" }}>
            <div style={kit.duo}>
              <div style={kit.card}><div style={kit.cardLabel}>{t("你猜")}</div><div style={kit.cardText}>{nb(chosen.text || "")}</div></div>
              <div style={{ ...kit.card, ...kit.cardHim }}><div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("湖里")}</div><div style={kit.cardText}>{nb(actual.text || "")}</div></div>
            </div>
            {phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)" }}>{nb(phase.reveal)}</div>}
            {step === 2
              ? <button style={kit.go} onClick={() => setStep(3)}>{t("后来呢 →")}</button>
              : <>
                  {phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}
                  {phase.artCard && <ArtCard src={phase.artCard} />}
                  <button style={kit.go} onClick={onComplete}>{t("继续 →")}</button>
                </>}
          </div>
        )}
        <style>{`
          @keyframes bfIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
          @keyframes bfToast { 0% { opacity: 0; transform: translate(-50%, 6px) } 15% { opacity: 1; transform: translate(-50%, 0) } 80% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -10px) } }
        `}</style>
      </div>
    </div>
  );
}

const bf = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    padding: "max(3%, 48px) 12% 0", textAlign: "center",
  },
  valley: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textShadow: "0 2px 12px rgba(0,0,0,0.6)",
    padding: "8px 26px", borderRadius: 14, backgroundColor: "rgba(20,15,10,0.38)" },
  vNum: { color: "#FBEFD5", fontSize: 12, letterSpacing: 6 },
  vName: { color: "#FFF8E8", fontSize: "clamp(22px, 2.3vw, 38px)", letterSpacing: 10 },
  vLine: { color: "#FBEFD5", fontSize: "clamp(12px, 0.97vw, 16px)", letterSpacing: 2 },
  vTip: { color: "#FFE3A8", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 2, marginTop: 4 },
  gust: { color: "#FFF8E8", fontSize: "clamp(14px, 1.2vw, 20px)", letterSpacing: 3, padding: "4px 16px", borderRadius: 12, backgroundColor: "rgba(140,60,30,0.7)" },
  toast: { position: "absolute", left: "50%", top: "46%", zIndex: 21, pointerEvents: "none", color: "#FFF8E8", fontSize: "clamp(14px, 1.2vw, 20px)", letterSpacing: 3, textShadow: "0 2px 10px rgba(0,0,0,0.9)" },
  lost: { color: "#E2D3B4", fontSize: "clamp(12px, 0.94vw, 15.5px)", letterSpacing: 1, lineHeight: 1.7, maxWidth: 760 },
  count: {
    position: "absolute", right: 18, top: 18, zIndex: 22, padding: "4px 14px", borderRadius: 14,
    backgroundColor: "rgba(20,15,10,0.6)", color: "#FBEFD5", fontSize: 14, letterSpacing: 3,
  },
  excuse: {
    position: "absolute", left: "4%", bottom: "6%", zIndex: 22, maxWidth: "min(46%, 520px)",
    padding: "10px 14px", borderRadius: 10, backgroundColor: "rgba(252,248,238,0.94)", color: "#2B2118",
    borderLeft: "3px solid #C9793A", fontSize: "clamp(12.5px, 1vw, 16.5px)", lineHeight: 1.6,
    display: "flex", flexDirection: "column", gap: 6,
  },
  bird: { color: "#8A5A1E", marginRight: 8, fontSize: 13, letterSpacing: 2 },
  reply: { borderTop: "1px dashed rgba(110,95,69,0.4)", paddingTop: 5 },
  ask: {
    alignSelf: "flex-start", minHeight: 32, padding: "4px 12px", borderRadius: 14, border: "1px solid #C9793A",
    background: "none", color: "#8A5A1E", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13,
  },
  hint: {
    position: "absolute", left: 0, right: 0, bottom: "3%", zIndex: 21, textAlign: "center", pointerEvents: "none",
    color: "#FFF8E8", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 3, textShadow: "0 2px 10px rgba(0,0,0,0.6)",
  },
  panel: {
    position: "absolute", left: 0, right: 0, top: "30%", zIndex: 25, overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "2% 8%",
    background: "radial-gradient(ellipse 60% 80% at 50% 50%, rgba(10,7,4,0.8), rgba(10,7,4,0))",
  },
};
