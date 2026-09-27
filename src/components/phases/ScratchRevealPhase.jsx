// ============================================================
// SCRATCH REVEAL — 亲手把墙磨亮，先猜，再拉开帘子（鲁米 · 中国画师与希腊画师）
// ============================================================
// 三拍：
//   1 磨（过桥动作）：玩家在粗糙的墙面上来回擦，墙一点点变成镜面——
//     此刻镜子里只映着对面那道帘子，玩家还不知道自己磨出来的是什么。
//   2 猜（先判断）：帘子拉开之前，先下判断。
//   3 拉帘（对照）：镜面里出现对面的整幅画（phase.mirrorImage 左右翻转），
//     「你猜 / 实际」并列，再给出处与引申。
// 「磨」本身不教东西，所以这个类型必须带 predict——lint 把它记在「先判断」。
//
// phase: {
//   background, legend?, situation, instruction,
//   mirrorImage（帘子拉开后映进镜子里的画）, mirrorFallback?（正式图缺失时用）, mirrorKey?（查墙签的原路径）, artCard?, threshold = 0.7, brush = 7（笔刷半径，占墙宽 %）,
//   polishedNote,
//   question, options: [{ id, text }], actual,
//   sameNote, diffNote, reveal, consequence
// }
import { useCallback, useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";
import { ArtBackdrop } from "./ArtCard";
import { artworkFor } from "../ArtworkLabel";

const GRID_X = 48, GRID_Y = 30; // 抽样估算磨亮了多少

// 粗灰泥：底色 + 斑点 + 几道裂纹。用种子随机，每次进来长得一样。
function paintPlaster(g, w, h) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#8C7B66";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 60; i++) {
    const v = 90 + Math.floor(rnd() * 70);
    g.fillStyle = `rgba(${v},${v - 12},${v - 26},${0.35 + rnd() * 0.4})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.strokeStyle = "rgba(60,48,36,0.55)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = rnd() * w, y = rnd() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * w * 0.12; y += (rnd() - 0.3) * h * 0.1; g.lineTo(x, y); }
    g.stroke();
  }
}

export default function ScratchRevealPhase({ phase, onScore, onComplete }) {
  const options = phase.options || [];
  const threshold = phase.threshold || 0.7;
  const brush = phase.brush || 7;
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(0); // 0 磨 · 1 猜 · 2 拉帘对照 · 3 后来
  const [progress, setProgress] = useState(0);
  const [mine, setMine] = useState(null);
  // 镜中画：正式图（真实古画）还没放进 public/ 时，退回 mirrorFallback
  const [mirror, setMirror] = useState(phase.mirrorImage);
  useEffect(() => {
    if (!phase.mirrorImage || !phase.mirrorFallback) return;
    const im = new Image();
    im.onerror = () => setMirror(phase.mirrorFallback);
    im.src = asset(phase.mirrorImage);
  }, [phase.mirrorImage, phase.mirrorFallback]);
  const wall = useRef(null);
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const sampleAt = useRef(0);
  const scored = useRef(false);

  const setup = useCallback(() => {
    const cv = canvas.current, el = wall.current;
    if (!cv || !el) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    // 只在第一次或尺寸变化时重画——重画会把已经磨掉的地方盖回去，所以缩放后按比例保留不了，
    // 干脆接受：窗口大小一变就重来（极少发生，且磨一面墙只要十几秒）。
    if (cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    paintPlaster(cv.getContext("2d", { willReadFrequently: true }), w, h);
    setProgress(0);
  }, []);

  useEffect(() => {
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, [setup]);

  const measure = useCallback(() => {
    const cv = canvas.current;
    if (!cv || !cv.width) return 0;
    const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let clear = 0;
    for (let j = 0; j < GRID_Y; j++) {
      for (let i = 0; i < GRID_X; i++) {
        const x = Math.floor(((i + 0.5) / GRID_X) * cv.width);
        const y = Math.floor(((j + 0.5) / GRID_Y) * cv.height);
        if (data[(y * cv.width + x) * 4 + 3] < 40) clear++;
      }
    }
    return clear / (GRID_X * GRID_Y);
  }, []);

  const finishPolish = useCallback(() => {
    setProgress(1);
    setStep(1);
    if (!scored.current && onScore) { scored.current = true; onScore("polish", POINTS.polish); }
  }, [onScore]);

  // strength < 1：一遍磨不透，要来回几遍——这正是「磨」的手感。键盘档一次磨透。
  const rub = (x, y, strength = 0.5) => {
    const cv = canvas.current;
    const g = cv.getContext("2d");
    const r = (brush / 100) * cv.width;
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = `rgba(0,0,0,${strength})`;
    g.lineCap = "round"; g.lineJoin = "round";
    g.lineWidth = r * 2;
    g.beginPath();
    const from = last.current || { x, y };
    g.moveTo(from.x, from.y); g.lineTo(x, y);
    g.stroke();
    last.current = { x, y };
    const now = performance.now();
    if (now - sampleAt.current > 120) {
      sampleAt.current = now;
      const p = measure();
      setProgress(p);
      if (p >= threshold) finishPolish();
    }
  };

  const local = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current.width, y: ((e.clientY - r.top) / r.height) * canvas.current.height };
  };
  const down = (e) => {
    if (step !== 0) return;
    drawing.current = true; last.current = null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e); rub(p.x, p.y);
  };
  const move = (e) => { if (drawing.current && step === 0) { const p = local(e); rub(p.x, p.y); } };
  const up = () => {
    drawing.current = false; last.current = null;
    if (step === 0) { const p = measure(); setProgress(p); if (p >= threshold) finishPolish(); }
  };

  // 键盘 / 读屏用户：每按一次磨掉一条横带
  const bands = useRef(0);
  const rubBand = () => {
    const cv = canvas.current; if (!cv) return;
    const n = 8, k = bands.current++ % n;
    const y = ((k + 0.5) / n) * cv.height;
    last.current = { x: 0, y };
    rub(cv.width, y, 1);
    last.current = null;
    const p = measure(); setProgress(p); if (p >= threshold) finishPolish();
  };

  const commit = (id) => {
    setMine(id);
    setStep(2);
    if (onScore) onScore("predict", POINTS.predict);
  };

  const actual = options.find((o) => o.id === phase.actual) || options[0] || {};
  const chosen = options.find((o) => o.id === mine) || {};
  const open = step >= 2;
  const fade = reduced ? "none" : "opacity 1.6s ease";

  return (
    <div style={kit.outer}>
      <div style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})` }}>
        <div style={{ ...kit.dim, backgroundColor: "rgba(12,8,5,0.66)" }} />
        {phase.artCard && <ArtBackdrop src={phase.artCard} />}
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        <div style={sr.top}>
          {step === 0 && phase.situation && <div style={kit.situation}>{nb(phase.situation)}</div>}
          {step === 0 && (
            <div style={kit.hint}>
              {nb(phase.instruction || t("按住，在墙上来回擦。"))}{`　${Math.round(progress * 100)}%`}
            </div>
          )}
          {step === 1 && <div style={kit.note}>{nb(phase.polishedNote || t("墙磨得像水一样亮——可现在它只映出对面那道帘子。"))}</div>}
        </div>

        {/* 墙：底下两层（映着帘子的镜面 / 映着画的镜面），上面盖一层灰泥 canvas */}
        <div ref={wall} style={{ ...sr.wall, ...(step >= 1 ? sr.wallOpen : null) }}>
          <div style={{ ...sr.layer, ...sr.curtainReflection, opacity: open ? 0 : 1, transition: fade }} />
          <div style={{
            ...sr.layer,
            backgroundImage: `url(${asset(mirror)})`,
            transform: "scaleX(-1)",
            filter: "brightness(1.08) saturate(1.12)",
            opacity: open ? 1 : 0, transition: fade,
          }} />
          <div style={{ ...sr.layer, ...sr.sheen, animation: reduced || !open ? "none" : "srSheen 3.6s ease-in-out 1.2s 2" }} />
          <canvas ref={canvas} aria-hidden="true"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
            style={{
              ...sr.layer, touchAction: "none", cursor: step === 0 ? "grab" : "default",
              opacity: step === 0 ? 1 : 0, transition: reduced ? "none" : "opacity 900ms ease",
              pointerEvents: step === 0 ? "auto" : "none",
            }} />
        </div>

        {step === 0 && (
          <button style={sr.kbd} onClick={rubBand}>{t("磨一下")}</button>
        )}
        {/* 镜中画是真实古画时，墙下挂一行墙签（图缺失、退回占位图时不挂） */}
        {step >= 2 && mirror === phase.mirrorImage && artworkFor(phase.mirrorKey) && (() => {
          const art = artworkFor(phase.mirrorKey);
          return <div style={sr.caption}>{t("镜中：")}{[art.title, art.artist, art.year, art.holder, art.license].filter(Boolean).join(" · ")}</div>;
        })()}

        {step === 1 && (
          <div style={sr.panel}>
            <div style={kit.question}>{nb(phase.question)}</div>
            <div style={kit.opts}>
              {options.map((o) => (
                <button key={o.id} style={kit.opt} onClick={() => commit(o.id)}>{nb(o.text)}</button>
              ))}
            </div>
            <div style={kit.hint}>{t("先猜，再拉开帘子。")}</div>
          </div>
        )}

        {step >= 2 && (
          <div style={sr.panel}>
            <div style={kit.duo}>
              <div style={kit.card}>
                <div style={kit.cardLabel}>{t("你猜")}</div>
                <div style={kit.cardText}>{nb(chosen.text || "")}</div>
              </div>
              <div style={{ ...kit.card, ...kit.cardHim }}>
                <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("帘子拉开")}</div>
                <div style={kit.cardText}>{nb(actual.text || "")}</div>
              </div>
            </div>
            <div style={kit.note}>
              {nb(mine === phase.actual
                ? (phase.sameNote || t("你猜到了镜子的用处。"))
                : (phase.diffNote || t("希腊画师赌的是另一件事——")))}
            </div>
            {phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)", lineHeight: 1.85 }}>{nb(phase.reveal)}</div>}
            {step === 2 ? (
              <button style={kit.go} onClick={() => setStep(3)}>{t("后来呢 →")}</button>
            ) : (
              <>
                {phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}
                
                <button style={kit.go} onClick={onComplete}>{t("继续 →")}</button>
              </>
            )}
          </div>
        )}
        <style>{`@keyframes srSheen { 0% { background-position: -60% 0 } 100% { background-position: 160% 0 } }`}</style>
      </div>
    </div>
  );
}

const sr = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 12,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "max(3%, 48px) 14% 0", textAlign: "center", pointerEvents: "none",
  },
  wall: {
    position: "absolute", left: "50%", top: "53%", transform: "translate(-50%, -50%)",
    width: "56%", height: "60%", zIndex: 10, overflow: "hidden", borderRadius: 4,
    border: "10px solid #5B4430", boxShadow: "0 0 0 2px #C9A86A, 0 18px 50px rgba(0,0,0,0.7)",
    backgroundColor: "#3A3530",
    transition: "top 1.2s ease, height 1.2s ease, width 1.2s ease",
  },
  // 磨完之后墙往上收，给下方的提问 / 对照面板让位
  wallOpen: { top: "27%", width: "44%", height: "40%" },
  layer: { position: "absolute", inset: 0, width: "100%", height: "100%", backgroundSize: "cover", backgroundPosition: "center" },
  // 磨亮了、但只映着对面那道深红帘子的镜面。
  //
  // 这一层要同时说清两件事：映的是「帘子」（所以要有褶），以及这面墙已经是
  // 「镜子」（所以要有反光）。原来只有一道 26px 的等距条纹加一条白光，读起来
  // 像墙后面挂了块红布——试玩时就有人问「这后面不该是镜子吗」。
  // 现在叠四层（从上往下）：
  //   1 斜向高光带  —— 抛光面的定向反射
  //   2 顶部亮 / 底部暗的竖向渐变 —— 光从上方来，褶子下缘积暗
  //   3 粗褶 + 细褶两组不等距条纹 —— 等距会像栅栏，不等距才像布
  //   4 整体的深红底
  curtainReflection: {
    background:
      // 1 镜面的斜向高光
      "linear-gradient(112deg, rgba(255,246,238,0) 22%, rgba(255,246,238,0.30) 38%," +
      " rgba(255,246,238,0.10) 46%, rgba(255,246,238,0) 62%)," +
      // 2 上亮下暗
      "linear-gradient(180deg, rgba(255,235,220,0.16) 0%, rgba(0,0,0,0) 34%," +
      " rgba(0,0,0,0.30) 82%, rgba(0,0,0,0.52) 100%)," +
      // 3a 细褶（窄、密）
      "repeating-linear-gradient(91deg, rgba(0,0,0,0.30) 0px, rgba(255,255,255,0.05) 7px," +
      " rgba(0,0,0,0.26) 15px)," +
      // 3b 粗褶（宽、不等距，靠三段不同的停点错开）
      "repeating-linear-gradient(90deg, #4A1512 0px, #7E2C26 18px, #93362C 31px," +
      " #6A211C 44px, #47130F 61px, #5C1B16 78px)," +
      // 4 底色
      "linear-gradient(#5E1F1C, #5E1F1C)",
    backgroundBlendMode: "screen, multiply, multiply, normal, normal",
  },
  sheen: {
    background: "linear-gradient(110deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0) 65%)",
    backgroundSize: "60% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "-60% 0",
    mixBlendMode: "screen", pointerEvents: "none",
  },
  caption: {
    position: "absolute", left: "50%", top: "48.5%", transform: "translateX(-50%)", zIndex: 12, width: "60%",
    textAlign: "center", color: "rgba(233,220,194,0.85)", fontSize: 12, letterSpacing: 1, textShadow: "0 1px 6px rgba(0,0,0,0.9)",
  },
  kbd: {
    position: "absolute", right: "4%", bottom: "5%", zIndex: 14, minHeight: 44, padding: "8px 18px",
    borderRadius: 22, border: "1px solid #C9A86A", backgroundColor: "rgba(252,248,238,0.85)", color: "#3A2E20",
    cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: 2,
  },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, maxHeight: "54%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    padding: "2.5% 8% 2.5%",
    background: "linear-gradient(to top, rgba(10,7,4,0.95) 0%, rgba(10,7,4,0.88) 75%, rgba(10,7,4,0) 100%)",
  },
};
