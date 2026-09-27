// ============================================================
// BIRD FLIGHT — 带鸟群飞过七个山谷（鲁米 · 1220 内沙布尔：阿塔尔《百鸟会议》）
// ============================================================
// 阿塔尔讲给孩子鲁米的故事：世上所有的鸟去找它们的王——神鸟西摩格。
// 戴胜鸟领路，要飞过七个山谷；一路上，鸟一只只找借口掉队。最后只剩三十只。
//
// 玩法：你就是戴胜鸟。鼠标（或方向键）带路，一大群鸟跟着你飞，山谷一个个过去。
// 每进一个山谷，有一群鸟找借口离开——点它的借口，看戴胜怎么回。
// 飞到湖边：先猜「西摩格在哪里」，再低头看湖——水里的倒影，是三十只鸟拼成的一只大鸟。
// 波斯语 sī murgh = 三十只鸟。
//
// phase: {
//   legend?, situation,
//   valleys: [{ name, line, sky: [top, bottom], hills: [far, mid, near], leave, excuse: { bird, text, reply } }],
//   startBirds = 100,
//   question, options: [{ id, text }], actual, reveal, consequence
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";

const SEG_SEC = 5.2;                 // 每个山谷飞多久
const LAKE_COLORS = { sky: ["#F2D9A6", "#9CC3C0"], hills: ["#8FA9A3", "#6C8B86", "#4E6E68"] };
const BIRD_COLORS = ["#6B4A2E", "#3F7A3A", "#2F5D8A", "#2F6F6B", "#B4762F", "#7A7A74", "#E8E2D6", "#3A2E28", "#A8865A", "#8A3A3A"];

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

  const [step, setStep] = useState(0);      // 0 飞 · 1 猜 · 2 看湖 · 3 后来
  const [valleyIdx, setValleyIdx] = useState(-1);
  const [excuse, setExcuse] = useState(null); // { bird, text, reply, open }
  const [left, setLeft] = useState(startBirds);
  const [mine, setMine] = useState(null);
  const stage = useRef(null);
  const canvas = useRef(null);
  const S = useRef(null);                   // 可变的模拟状态
  const stepRef = useRef(0);
  stepRef.current = step;

  if (!S.current) {
    const birds = [];
    for (let i = 0; i < startBirds; i++) {
      birds.push({
        x: 0.1 + Math.random() * 0.2, y: 0.3 + Math.random() * 0.4, vx: 0, vy: 0,
        ox: -0.03 - Math.random() * 0.22, oy: (Math.random() - 0.5) * 0.3,  // 跟在戴胜身后的队形偏移
        ph: Math.random() * Math.PI * 2, c: BIRD_COLORS[i % BIRD_COLORS.length], leaving: 0, gone: false,
      });
    }
    S.current = { birds, hx: 0.38, hy: 0.45, tx: 0.38, ty: 0.45, t: 0, lastValley: -1, lakeAt: 0, lake: null };
  }

  // 戴胜跟着指针
  const onMove = (e) => {
    if (stepRef.current !== 0) return;
    const r = stage.current.getBoundingClientRect();
    S.current.tx = Math.max(0.12, Math.min(0.62, (e.clientX - r.left) / r.width));
    S.current.ty = Math.max(0.16, Math.min(0.82, (e.clientY - r.top) / r.height));
  };
  const onKey = (e) => {
    const d = 0.04, s = S.current;
    if (e.key === "ArrowUp") s.ty = Math.max(0.16, s.ty - d);
    else if (e.key === "ArrowDown") s.ty = Math.min(0.82, s.ty + d);
    else if (e.key === "ArrowLeft") s.tx = Math.max(0.12, s.tx - d);
    else if (e.key === "ArrowRight") s.tx = Math.min(0.62, s.tx + d);
    else return;
    e.preventDefault();
  };

  useEffect(() => {
    let raf = 0, prev = performance.now();
    const total = valleys.length * SEG_SEC;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const s = S.current, cv = canvas.current, el = stage.current;
      if (!cv || !el) { raf = requestAnimationFrame(tick); return; }
      const W = el.clientWidth, H = el.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const st = stepRef.current;
      if (st === 0) s.t += dt;
      const flightT = Math.min(s.t, total);
      const vi = Math.min(valleys.length - 1, Math.floor(flightT / SEG_SEC));
      const within = (flightT % SEG_SEC) / SEG_SEC;
      const atLake = s.t >= total;

      // 进入新山谷：一群鸟离开
      if (st === 0 && !atLake && vi !== s.lastValley) {
        s.lastValley = vi;
        setValleyIdx(vi);
        const v = valleys[vi];
        const stay = s.birds.filter((b) => !b.leaving && !b.gone);
        const n = Math.min(v.leave || 0, Math.max(0, stay.length - 30));
        for (let k = 0; k < n; k++) stay[stay.length - 1 - k].leaving = 0.001;
        setLeft(stay.length - n);
        if (v.excuse) setExcuse({ ...v.excuse, open: false });
      }
      if (st === 0 && atLake) {
        if (!s.lakeAt) { s.lakeAt = now; setExcuse(null); setValleyIdx(valleys.length); }
        if (now - s.lakeAt > 1800 && !s.asked) { s.asked = true; setStep(1); }
      }

      // —— 天空与山 ——
      const cur = atLake || !valleys[vi] ? LAKE_COLORS : valleys[vi];
      const nxt = atLake ? LAKE_COLORS : (valleys[vi + 1] || LAKE_COLORS);
      const k = atLake ? 0 : Math.max(0, (within - 0.7) / 0.3);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, lerpColor(cur.sky[0], nxt.sky[0], k));
      sky.addColorStop(1, lerpColor(cur.sky[1], nxt.sky[1], k));
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const scroll = (atLake ? total : flightT) * W * 0.25;
      [0.25, 0.55, 1].forEach((par, li) => {
        g.fillStyle = lerpColor(cur.hills[li], nxt.hills[li], k);
        g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
          const wx = (x + scroll * par) / W;
          const base = H * (0.62 + li * 0.1);
          const y = base - (Math.sin(wx * 5.1 + li) * 0.07 + Math.sin(wx * 11.3 + li * 2) * 0.035 + Math.sin(wx * 2.3) * 0.05) * H * (1.2 - li * 0.25);
          g.lineTo(x, y);
        }
        g.lineTo(W, H); g.closePath(); g.fill();
      });

      // 湖
      if (atLake) {
        const lakeTop = H * 0.66;
        const lg = g.createLinearGradient(0, lakeTop, 0, H);
        lg.addColorStop(0, "#7FB0AE"); lg.addColorStop(1, "#2E5B63");
        g.fillStyle = lg; g.fillRect(0, lakeTop, W, H - lakeTop);
        g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
        for (let r = 0; r < 6; r++) { g.beginPath(); g.moveTo(W * 0.1, lakeTop + 14 + r * 22); g.lineTo(W * 0.9, lakeTop + 14 + r * 22); g.stroke(); }
      }

      // —— 戴胜 ——
      if (st === 0) { s.hx += (s.tx - s.hx) * 0.06; s.hy += (s.ty - s.hy) * 0.06; }
      if (atLake && st >= 1) { s.hx += (0.5 - s.hx) * 0.04; s.hy += (0.34 - s.hy) * 0.04; }

      // —— 鸟群 ——
      const alive = s.birds.filter((b) => !b.gone && !b.leaving);
      const pts = simorghPoints();
      alive.forEach((b, i) => {
        let tx, ty;
        if (atLake && st >= 2 && i < 30) {
          // 停在湖面上方一排
          tx = 0.2 + (i / 29) * 0.6; ty = 0.58 + Math.sin(i * 1.7) * 0.02;
        } else if (atLake) {
          tx = 0.5 + b.ox * 1.2 + 0.1; ty = 0.34 + b.oy * 0.7;
        } else {
          tx = s.hx + b.ox; ty = s.hy + b.oy * (0.6 + 0.4 * Math.sin(now / 900 + b.ph));
        }
        b.vx += (tx - b.x) * 2.2 * dt + (Math.random() - 0.5) * 0.02 * dt;
        b.vy += (ty - b.y) * 2.2 * dt + (Math.random() - 0.5) * 0.02 * dt;
        b.vx *= 0.93; b.vy *= 0.93;
        b.x += b.vx * dt * 6; b.y += b.vy * dt * 6;
        b.i = i;
      });
      for (const b of s.birds) {
        if (b.leaving && !b.gone) {
          b.leaving += dt;
          b.vy += 0.06 * dt; b.vx -= 0.03 * dt;
          b.x += b.vx * dt * 6; b.y += b.vy * dt * 6 + 0.04 * dt;
          if (b.leaving > 3 || b.y > 1.1) b.gone = true;
        }
      }
      const drawBird = (x, y, c, size, ph, alpha = 1) => {
        const flap = reduced ? 0.5 : Math.sin(now / 110 + ph);
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
        drawBird(b.x * W, b.y * H, b.c, size, b.ph, b.leaving ? Math.max(0, 1 - b.leaving / 3) : 1);
      }
      // 戴胜：大一点，带冠羽
      if (!atLake || st < 2) {
        const hx = s.hx * W, hy = s.hy * H;
        drawBird(hx, hy, "#C9793A", size * 2, 0);
        g.fillStyle = "#E3A24E";
        g.beginPath(); g.moveTo(hx - 2, hy - 3); g.lineTo(hx + 4, hy - size * 2.2); g.lineTo(hx + 7, hy - 2); g.closePath(); g.fill();
      }

      // —— 湖里的倒影：三十只鸟拼成的西摩格 ——
      if (atLake && st >= 2) {
        s.reflT = (s.reflT || 0) + dt;
        const m = Math.min(1, s.reflT / 3.2);
        const lakeTop = H * 0.66, lakeH = H - lakeTop;
        const cx = W * 0.5, cy = lakeTop + lakeH * 0.42;
        const L = Math.min(W * 0.55, lakeH * 2.6);
        const shown = alive.slice(0, 30);
        // 湖面上方那一排鸟的倒影 → 逐渐滑到西摩格的轮廓上
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
            const idx = ch.length === 2 ? Array.from({ length: ch[1] - ch[0] }, (_, k) => ch[0] + k) : ch;
            g.beginPath();
            idx.forEach((k, j) => { const q = P[k]; if (!q) return; j === 0 ? g.moveTo(q[0], q[1]) : g.lineTo(q[0], q[1]); });
            g.stroke();
          }
          g.shadowBlur = 0;
        }
        P.forEach(([x, y], i) => drawBird(x, y, m > 0.9 ? "#F5D282" : shown[i].c, size, shown[i].ph, 0.75));
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valleys, reduced]);

  const commit = (id) => {
    setMine(id);
    setStep(2);
    if (onScore) onScore("predict", POINTS.predict);
  };

  const v = valleyIdx >= 0 && valleyIdx < valleys.length ? valleys[valleyIdx] : null;
  const actual = options.find((o) => o.id === phase.actual) || {};
  const chosen = options.find((o) => o.id === mine) || {};

  return (
    <div style={kit.outer}>
      <div ref={stage} tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerDown={onMove}
        aria-label={t("用方向键带着鸟群飞")}
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
            </div>
          )}
        </div>

        <div style={bf.count}>{t("鸟")}{"　"}<b style={{ fontVariantNumeric: "tabular-nums" }}>{left}</b></div>

        {step === 0 && excuse && (
          <div style={bf.excuse} aria-live="polite">
            <div><span style={bf.bird}>{nb(excuse.bird)}</span>{nb(excuse.text)}</div>
            {excuse.open
              ? <div style={bf.reply}><span style={bf.bird}>{t("戴胜")}</span>{nb(excuse.reply)}</div>
              : <button style={bf.ask} onClick={() => setExcuse({ ...excuse, open: true })}>{t("戴胜怎么回？")}</button>}
          </div>
        )}
        {step === 0 && valleyIdx === 0 && <div style={bf.hint}>{t("你是戴胜鸟。移动鼠标，带着鸟群飞。")}</div>}

        {step === 1 && (
          <div style={bf.panel}>
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
              : <>{phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}<button style={kit.go} onClick={onComplete}>{t("继续 →")}</button></>}
          </div>
        )}
        <style>{`@keyframes bfIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
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
