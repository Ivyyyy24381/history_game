// ============================================================
// POOL RESCUE — 书落水池：只来得及救一本（鲁米 · 1244 遇见沙姆斯）
// ============================================================
// 传说（阿夫拉基《圣徒传》）：沙姆斯指着鲁米的书问「这些是什么？」
// 鲁米答「是你不懂的东西。」沙姆斯把书扔进水池。鲁米心疼得不得了——
// 沙姆斯伸手把书一本本捞出来，书页竟然是干的。鲁米问「这是什么？」
// 沙姆斯答：「这是你不懂的东西。」——同一句话，对调了过来。
//
// 玩法：三本书落水，慢慢往下沉，墨在水里晕开。玩家按住一本拖出池子——
// 只来得及救一本（先判断：你最舍不得哪一本？）。然后沙姆斯把全部捞上来，干的。
// 最后「你救下的 / 沙姆斯捞起的」并排，按玩家救的那本给一句不同的话。
//
// phase: {
//   background, legend?,
//   introBeats: [{ who, text }], outroBeats: [{ who, text }],
//   books: [{ id, title, sub?, color, note }], sinkSec = 8,
//   noneNote, reveal, consequence
// }
import { useCallback, useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";

// 池子在舞台上的位置（百分比）
const POOL = { x: 20, y: 36, w: 60, h: 44 };
// 书落水后的位置（池内百分比 → 舞台百分比）
const SLOTS = [
  { x: POOL.x + POOL.w * 0.24, y: POOL.y + POOL.h * 0.52 },
  { x: POOL.x + POOL.w * 0.52, y: POOL.y + POOL.h * 0.40 },
  { x: POOL.x + POOL.w * 0.78, y: POOL.y + POOL.h * 0.58 },
];
const inPool = (x, y) => x > POOL.x && x < POOL.x + POOL.w && y > POOL.y && y < POOL.y + POOL.h;

export default function PoolRescuePhase({ phase, onScore, onComplete }) {
  const books = (phase.books || []).slice(0, 3);
  const intro = phase.introBeats || [];
  const outro = phase.outroBeats || [];
  const sinkMs = (phase.sinkSec || 8) * 1000;
  const reduced = usePrefersReducedMotion();

  // intro → throw → sink → shams → outro → result → after
  const [step, setStep] = useState(intro.length ? "intro" : "throw");
  const [beat, setBeat] = useState(0);
  const [saved, setSaved] = useState(null); // 救下的那本 id；null = 一本也没救
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const stage = useRef(null);
  const canvas = useRef(null);
  // 每本书的运动状态放在 ref 里，rAF 每帧改，避免整棵树每帧重渲染
  const st = useRef(books.map((b, i) => ({
    id: b.id, x: 50 + (i - 1) * 8, y: 12, depth: 0, t0: 0, dragging: false, out: false, landed: false,
  })));
  const ripples = useRef([]);
  const inks = useRef([]);
  const drag = useRef(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  // —— 抛书 ——
  useEffect(() => {
    if (step !== "throw") return undefined;
    const now = performance.now();
    st.current.forEach((b, i) => {
      b.x = SLOTS[i].x; b.y = SLOTS[i].y; b.t0 = now + 700 + i * 350; b.landed = false;
    });
    rerender();
    const timers = st.current.map((b, i) => setTimeout(() => {
      b.landed = true;
      ripples.current.push({ x: b.x, y: b.y, t: performance.now(), big: true });
    }, 650 + i * 350));
    const go = setTimeout(() => setStep("sink"), 700 + books.length * 350);
    return () => { timers.forEach(clearTimeout); clearTimeout(go); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // —— 画水面 + 驱动下沉 ——
  const draw = useCallback((now) => {
    const cv = canvas.current, el = stage.current;
    if (!cv || !el) return;
    const W = el.clientWidth, H = el.clientHeight;
    const pw = (POOL.w / 100) * W, ph = (POOL.h / 100) * H;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(pw * dpr)) { cv.width = Math.round(pw * dpr); cv.height = Math.round(ph * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 水
    const grad = g.createLinearGradient(0, 0, 0, ph);
    grad.addColorStop(0, "#23515C"); grad.addColorStop(0.55, "#12333C"); grad.addColorStop(1, "#0A1E25");
    g.fillStyle = grad; g.fillRect(0, 0, pw, ph);
    // 倒影：上沿映出对面的拱廊。不求像，只要让水面「映着东西」，
    // 不然一池纯色看着就是一块布。
    const refl = g.createLinearGradient(0, 0, 0, ph * 0.42);
    refl.addColorStop(0, "rgba(176,205,206,0.22)");
    refl.addColorStop(1, "rgba(176,205,206,0)");
    g.fillStyle = refl; g.fillRect(0, 0, pw, ph * 0.42);
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = "#06161C";
    const archN = 5, archW = pw / archN;
    for (let i = 0; i < archN; i++) {
      const cx = (i + 0.5) * archW;
      const aw = archW * 0.30, ah = ph * 0.30;
      g.beginPath();
      g.moveTo(cx - aw, 0);
      g.lineTo(cx - aw, ah * 0.55);
      g.quadraticCurveTo(cx, ah * 1.15, cx + aw, ah * 0.55);
      g.lineTo(cx + aw, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
    // 波光
    const tt = reduced ? 0 : now / 1000;
    g.strokeStyle = "rgba(220,240,235,0.10)"; g.lineWidth = 1.4;
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      const y0 = (k + 0.5) * (ph / 9);
      for (let x = 0; x <= pw; x += 12) {
        const y = y0 + Math.sin(x / 38 + tt * 1.3 + k) * 3 + Math.sin(x / 17 - tt * 0.8) * 1.2;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    const toLocal = (sx, sy) => [((sx - POOL.x) / POOL.w) * pw, ((sy - POOL.y) / POOL.h) * ph];
    // 墨晕
    inks.current = inks.current.filter((c) => now - c.t < 5200);
    for (const c of inks.current) {
      const a = (now - c.t) / 5200;
      const [x, y] = toLocal(c.x, c.y);
      const r = 10 + a * c.r * pw * 0.01;
      const ig = g.createRadialGradient(x, y, 0, x, y, r);
      ig.addColorStop(0, `rgba(10,12,20,${0.34 * (1 - a) * c.k})`);
      ig.addColorStop(1, "rgba(10,12,20,0)");
      g.fillStyle = ig; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 涟漪
    ripples.current = ripples.current.filter((r) => now - r.t < 1600);
    for (const r of ripples.current) {
      const a = (now - r.t) / 1600;
      const [x, y] = toLocal(r.x, r.y);
      g.strokeStyle = `rgba(235,248,244,${0.55 * (1 - a)})`;
      g.lineWidth = 2;
      for (const m of r.big ? [1, 0.6] : [1]) {
        g.beginPath(); g.ellipse(x, y, a * (r.big ? 90 : 50) * m, a * (r.big ? 36 : 20) * m, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    // 池沿内阴影
    const edge = g.createLinearGradient(0, 0, 0, 18);
    edge.addColorStop(0, "rgba(0,0,0,0.45)"); edge.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = edge; g.fillRect(0, 0, pw, 18);
  }, [reduced]);

  useEffect(() => {
    let raf = 0, lastInk = 0;
    const tick = (now) => {
      const s = stepRef.current;
      if (s === "sink") {
        let allDone = true;
        for (const b of st.current) {
          if (b.out || b.dragging) continue;
          const target = saved !== null ? 1 : Math.min(1, (now - b.t0) / sinkMs);
          // 救下一本之后，其余几本很快沉底（「够了」）
          b.depth = saved !== null ? Math.min(1, b.depth + 0.02) : Math.max(b.depth, target);
          if (b.depth < 1) allDone = false;
        }
        if (now - lastInk > 380) {
          lastInk = now;
          for (const b of st.current) {
            if (!b.out && !b.dragging && b.depth > 0.05 && b.depth < 1) {
              inks.current.push({ x: b.x + (Math.random() - 0.5) * 3, y: b.y + (Math.random() - 0.5) * 3, t: now, r: 7 + Math.random() * 6, k: 1 });
            }
          }
        }
        if (allDone) { setStep("shams"); }
        rerender();
      } else if (s === "shams") {
        // 沙姆斯把书捞上来：沉下去的浮起，落到池沿上；墨迹褪去
        let up = true;
        st.current.forEach((b, i) => {
          if (b.out) return;
          b.depth = Math.max(0, b.depth - 0.018);
          const rimY = POOL.y - 6; // 捞到池子后沿（沙姆斯那一侧），不被下方面板挡住
          b.y += (rimY - b.y) * 0.05;
          b.x += (SLOTS[i].x - b.x) * 0.05;
          if (b.depth > 0 || Math.abs(rimY - b.y) > 0.5) up = false;
        });
        inks.current.forEach((c) => { c.k = Math.max(0, c.k - 0.02); });
        if (up) { st.current.forEach((b) => { if (!b.out) b.out = true; }); setStep(outro.length ? "outro" : "result"); setBeat(0); }
        rerender();
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, saved, sinkMs, outro.length]);

  // —— 拖书 ——
  const pct = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };
  const down = (e, i) => {
    if (step !== "sink" || saved !== null) return;
    const b = st.current[i];
    if (b.depth >= 1 || b.out) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    b.dragging = true;
    drag.current = i;
    ripples.current.push({ x: b.x, y: b.y, t: performance.now() });
  };
  const move = (e) => {
    if (drag.current === null) return;
    const [x, y] = pct(e);
    const b = st.current[drag.current];
    b.x = Math.max(4, Math.min(96, x)); b.y = Math.max(8, Math.min(94, y));
    // 离水越远越「浮」
    if (!inPool(b.x, b.y)) b.depth = Math.max(0, b.depth - 0.05);
    rerender();
  };
  const rescue = useCallback((i) => {
    const b = st.current[i];
    b.out = true; b.depth = 0; b.dragging = false;
    b.x = 10; b.y = 30; // 放到岸边左侧，别挡住顶部的字
    setSaved(b.id);
    if (onScore) onScore("predict", POINTS.predict);
    // 其余的书：t0 失效，交给 tick 里「很快沉底」
  }, [onScore]);
  const up = () => {
    if (drag.current === null) return;
    const i = drag.current;
    drag.current = null;
    const b = st.current[i];
    if (!inPool(b.x, b.y)) {
      rescue(i);
    } else {
      b.dragging = false;
      // 放回水里：从当前深度继续往下沉
      b.t0 = performance.now() - b.depth * sinkMs;
      ripples.current.push({ x: b.x, y: b.y, t: performance.now() });
    }
  };
  // 键盘：Enter 直接把这本拖出池子
  const keyRescue = (e, i) => {
    if ((e.key === "Enter" || e.key === " ") && step === "sink" && saved === null && st.current[i].depth < 1) {
      e.preventDefault();
      const b = st.current[i];
      rescue(i);
    }
  };

  const savedBook = books.find((b) => b.id === saved);
  const beats = step === "intro" ? intro : step === "outro" ? outro : null;

  return (
    <div style={kit.outer}>
      <div ref={stage} style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})`, touchAction: "none" }}
        onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div style={{ ...kit.dim, backgroundColor: "rgba(12,8,5,0.5)" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        {/* 池沿 + 水面 */}
        <div style={{ ...pr.rim, left: `${POOL.x}%`, top: `${POOL.y}%`, width: `${POOL.w}%`, height: `${POOL.h}%` }}>
          <canvas ref={canvas} aria-hidden="true" style={pr.water} />
        </div>

        {/* 书 */}
        {step !== "intro" && books.map((bk, i) => {
          const b = st.current[i];
          const d = b.depth;
          const flying = step === "throw" && !b.landed;
          return (
            <button key={bk.id}
              onPointerDown={(e) => down(e, i)} onKeyDown={(e) => keyRescue(e, i)}
              aria-label={`${bk.title}${t("，按回车把它拖出水池")}`}
              style={{
                ...pr.book, background: bk.color || "#6B3A2A",
                left: `${b.x}%`, top: `${b.y}%`,
                transform: `translate(-50%, -50%) scale(${1 - 0.38 * d}) rotate(${(i - 1) * 9 + (flying ? 180 : 0)}deg)`,
                filter: `brightness(${1 - 0.55 * d}) blur(${(d * 1.6).toFixed(2)}px) saturate(${1 - 0.4 * d})`,
                opacity: d >= 1 ? 0.18 : 1 - 0.6 * d,
                transition: step === "throw" ? "left 650ms cubic-bezier(.3,.7,.4,1), top 650ms cubic-bezier(.5,-0.3,.7,1), transform 650ms ease"
                  : (b.out && bk.id === saved && step === "sink") ? "left 450ms ease, top 450ms ease" : "none",
                cursor: step === "sink" && saved === null && d < 1 ? "grab" : "default",
                zIndex: b.dragging ? 18 : 12,
                boxShadow: b.out ? "0 10px 22px rgba(0,0,0,0.55)" : "none",
              }}>
              <span style={pr.bookTitle}>{nb(bk.title)}</span>
              {bk.sub && <span style={pr.bookSub}>{nb(bk.sub)}</span>}
            </button>
          );
        })}

        {/* 顶部：对白 / 提示 */}
        <div style={pr.top}>
          {beats && beats[beat] && (
            <div style={pr.beat} aria-live="polite">
              <span style={pr.who}>{nb(beats[beat].who)}</span>
              <span>{nb(beats[beat].text)}</span>
            </div>
          )}
          {step === "sink" && saved === null && (
            <div style={pr.hint}>{t("书在往下沉！按住一本，拖出水池。")}</div>
          )}
          {step === "sink" && saved !== null && (
            <div style={pr.hint}>{t("沙姆斯按住了你的手：「够了。」")}</div>
          )}
          {step === "shams" && <div style={pr.hint}>{t("沙姆斯把手伸进水里……")}</div>}
        </div>

        {beats && (
          <button style={{ ...kit.go, ...pr.beatGo }} onClick={() => {
            if (beat < beats.length - 1) setBeat(beat + 1);
            else if (step === "intro") setStep("throw");
            else setStep("result");
          }}>{beat < beats.length - 1 ? t("……") : step === "intro" ? t("他把书扔了出去 →") : t("继续 →")}</button>
        )}

        {(step === "result" || step === "after") && (
          <div style={pr.panel}>
            <div style={kit.duo}>
              <div style={kit.card}>
                <div style={kit.cardLabel}>{t("你救下的")}</div>
                <div style={kit.cardText}>{savedBook ? nb(`《${savedBook.title}》`) : t("一本也没来得及救")}</div>
              </div>
              <div style={{ ...kit.card, ...kit.cardHim }}>
                <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("沙姆斯捞起的")}</div>
                <div style={kit.cardText}>{t("全部——而且书页是干的")}</div>
              </div>
            </div>
            <div style={kit.note}>{nb(savedBook ? savedBook.note : (phase.noneNote || ""))}</div>
            {phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)" }}>{nb(phase.reveal)}</div>}
            {step === "result" ? (
              <button style={kit.go} onClick={() => setStep("after")}>{t("后来呢 →")}</button>
            ) : (
              <>
                {phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}
                <button style={kit.go} onClick={onComplete}>{t("继续 →")}</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const pr = {
  // 水池是嵌在院子地面里的，不是扣在地上的一块板：
  // 池沿用石头的冷灰，圆角收小，外面不再描亮边，投影收在池子底下一点点。
  rim: {
    position: "absolute", zIndex: 8, borderRadius: 5, overflow: "hidden",
    border: "10px solid transparent",
    background:
      "linear-gradient(#0D2129, #0D2129) padding-box," +
      "linear-gradient(180deg, #9C907E 0%, #7C7162 46%, #5E5446 100%) border-box",
    boxShadow:
      "inset 0 0 0 1px rgba(30,24,16,0.85)," +          // 石沿内侧的暗线
      "inset 0 10px 22px rgba(0,0,0,0.55)," +           // 水面比地面低
      "0 6px 18px rgba(0,0,0,0.45)",
  },
  water: { width: "100%", height: "100%", display: "block" },
  book: {
    position: "absolute", width: "8.2%", aspectRatio: "3 / 4", padding: "6px 5px", borderRadius: 3,
    border: "none", outline: "2px solid rgba(217,187,126,0.85)", outlineOffset: -6,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
    color: "#F3E3C0", fontFamily: "var(--font-body)", touchAction: "none", userSelect: "none",
  },
  bookTitle: { fontSize: "clamp(11px, 0.9vw, 15px)", letterSpacing: 1, lineHeight: 1.25, textAlign: "center" },
  bookSub: { fontSize: "clamp(9px, 0.62vw, 11px)", opacity: 0.85, textAlign: "center", lineHeight: 1.2 },
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    padding: "max(4%, 52px) 12% 0", textAlign: "center",
  },
  beat: {
    display: "flex", flexDirection: "column", gap: 4, padding: "12px 22px", borderRadius: 10, maxWidth: 680,
    backgroundColor: "rgba(246,236,214,0.95)", color: "#2B2118", borderLeft: "3px solid #C9A86A",
    fontSize: "clamp(14px, 1.2vw, 20px)", lineHeight: 1.7, letterSpacing: 1, textAlign: "left",
  },
  who: { fontSize: 12, letterSpacing: 3, color: "#6E5F45" },
  beatGo: { position: "absolute", left: "50%", bottom: "5%", transform: "translateX(-50%)", zIndex: 22 },
  hint: {
    color: "#F5E6D3", fontSize: "clamp(14px, 1.2vw, 20px)", letterSpacing: 3,
    textShadow: "0 2px 12px rgba(0,0,0,0.95)",
  },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25, maxHeight: "60%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    padding: "3% 8% 2.5%",
    background: "linear-gradient(to top, rgba(10,7,4,0.95) 0%, rgba(10,7,4,0.88) 75%, rgba(10,7,4,0) 100%)",
  },
};
