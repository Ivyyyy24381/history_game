// ============================================================
// SILENCE CHOICE — 静下来（鲁米 · 1244「你自己，知道些什么？」）
// ============================================================
// 沙姆斯问了一个书里没有答案的问题。鲁米脑子里的「书上的话」围着他乱转——
// 经典注释、父亲的教诲、伊本·西那、法学家……这些句子在屏幕上绕着一支蜡烛飞。
//
//   · 点一句 = 说出口。沙姆斯当场驳回，那句话碎掉。
//   · 鼠标一动，句子转得更急、蜡烛乱晃（心乱）。
//   · 手停下来，句子就慢慢停住、一句一句往下掉。
//   · 句子全部没了（说完了，或者静下来落光了）——沉默本身成了回答，立刻进入对照。
//
// 不显示倒计时，也不告诉玩家「别动」——要他自己发现。说得越多，越晚发现。
//
// phase: {
//   background, legend?, speaker?: { name },
//   question,
//   options: [{ id, text, rebuttal }]        // 会被驳回的「正经答案」
//   noise:   ["「伊本·西那说……」", ...]       // 脑子里的其他杂音
//   noiseRebuttals: ["「又是别人的话。」", ...],
//   silenceReveal, consequence
// }
import { useCallback, useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";

const CX = 50, CY = 60;           // 旋转中心（舞台百分比）
const STILL_MS = 1400;            // 手停多久算「静」
const FIRST_FALL_MS = 5000;       // 进场后至少这么久才开始掉（给玩家读题的时间）
const FALL_EVERY_MS = 1100;

export default function SilenceChoicePhase({ phase, onScore, onComplete }) {
  const reduced = usePrefersReducedMotion();
  const speaker = (phase.speaker && phase.speaker.name) || t("他");
  const noiseRebuttals = phase.noiseRebuttals && phase.noiseRebuttals.length
    ? phase.noiseRebuttals : [t("「又是别人的话。」")];

  // 句子：正经答案 + 杂音，一起绕着蜡烛转
  const chips = useRef(null);
  if (!chips.current) {
    const all = [
      ...(phase.options || []).map((o) => ({ id: o.id, text: o.text, rebuttal: o.rebuttal, main: true })),
      ...(phase.noise || []).map((n, i) => ({ id: "noise" + i, text: n, main: false })),
    ];
    chips.current = all.map((c, i) => ({
      ...c,
      th: (i / all.length) * Math.PI * 2 + (i % 2) * 0.4,
      r: 17 + ((i * 7) % 5) * 5,           // 17–37%
      w: (i % 2 ? 1 : -1) * (0.18 + (i % 3) * 0.05),
      x: CX, y: CY, rot: 0, vy: 0, op: 1,
      state: "float",                        // float → spoken / falling → gone
    }));
  }
  const els = useRef({});
  const candle = useRef(null);
  const agit = useRef(0.35);
  const lastMove = useRef(performance.now());
  const mountAt = useRef(performance.now());
  const lastFall = useRef(0);
  const [said, setSaid] = useState([]);         // 说出口的 {text, rebuttal}
  const [step, setStep] = useState(0);          // 0 进行 · 1 沉默之后 · 2 后来
  const [calm, setCalm] = useState(false);      // 仅用于提示文字的淡入
  const [, force] = useState(0);
  const stepRef = useRef(0);
  stepRef.current = step;
  const scoreRef = useRef(onScore);
  scoreRef.current = onScore;

  const stir = useCallback((amount) => {
    lastMove.current = performance.now();
    agit.current = Math.min(1, agit.current + amount);
  }, []);

  useEffect(() => {
    let raf = 0, prev = performance.now();
    const tick = (now) => {
      const dt = Math.min(50, now - prev) / 1000; prev = now;
      const still = now - lastMove.current;
      agit.current = Math.max(0.08, agit.current * (still > STILL_MS ? 0.95 : 0.985));
      const A = agit.current;
      const list = chips.current;

      // 静下来 → 一句一句掉
      if (stepRef.current === 0 && still > STILL_MS && now - mountAt.current > FIRST_FALL_MS
          && now - lastFall.current > FALL_EVERY_MS) {
        const floating = list.filter((c) => c.state === "float");
        if (floating.length) {
          const c = floating[Math.floor(Math.random() * floating.length)];
          c.state = "falling"; c.vy = 0;
          lastFall.current = now;
        }
      }

      for (const c of list) {
        const el = els.current[c.id];
        if (c.state === "float" && c.hover) {
          // 指到的那一句停住，好点（像抓住了一个念头）
        } else if (c.state === "float") {
          c.th += c.w * (reduced ? 0.3 : (0.25 + 2.6 * A)) * dt;
          const jitter = reduced ? 0 : A * 1.2;
          c.x = CX + c.r * Math.cos(c.th) + (Math.random() - 0.5) * jitter;
          c.y = CY + c.r * 0.62 * Math.sin(c.th) + (Math.random() - 0.5) * jitter;
          c.op = 0.55 + 0.45 * Math.min(1, A * 1.6);
        } else if (c.state === "falling") {
          c.vy += 38 * dt; c.y += c.vy * dt; c.rot += 25 * dt; c.op = Math.max(0, c.op - 0.5 * dt);
          if (c.y > 108 || c.op <= 0) { c.state = "gone"; force((n) => n + 1); }
        } else if (c.state === "spoken") {
          c.y += (22 - c.y) * 0.12; c.x += (50 - c.x) * 0.12; c.op -= 1.4 * dt;
          if (c.op <= 0) { c.state = "gone"; force((n) => n + 1); }
        }
        if (el) {
          el.style.left = c.x + "%"; el.style.top = c.y + "%";
          el.style.opacity = String(Math.max(0, c.op));
          el.style.transform = `translate(-50%, -50%) rotate(${c.rot}deg)`;
        }
      }

      if (candle.current) {
        const f = reduced ? 0 : A;
        const sway = (Math.sin(now / 90) + Math.sin(now / 53)) * 6 * f;
        const sy = 1 + (Math.sin(now / 70) * 0.12 * f);
        candle.current.style.transform = `skewX(${sway}deg) scaleY(${sy})`;
      }

      const left = list.some((c) => c.state !== "gone");
      if (stepRef.current === 0) {
        setCalm((v) => (v !== (still > STILL_MS) ? still > STILL_MS : v));
        // 句子没了就结束——不管是说完的、还是静下来落光的。不再额外等一段安静（试玩反馈：那段等待不直观）
        if (!left) {
          setStep(1);
          if (scoreRef.current) scoreRef.current("silence", POINTS.silence);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const speak = (c) => {
    if (step !== 0 || c.state !== "float") return;
    stir(0.35);
    c.state = "spoken";
    const rebuttal = c.main ? c.rebuttal : noiseRebuttals[said.filter((s) => !s.main).length % noiseRebuttals.length];
    setSaid((xs) => [...xs, { text: c.text, rebuttal, main: c.main }]);
  };

  const lastTwo = said.slice(-2);
  const floatingLeft = chips.current.filter((c) => c.state === "float").length;

  return (
    <div style={kit.outer}>
      <div style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})` }}
        onPointerMove={(e) => { const m = Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); stir(Math.min(0.25, m / 260)); }}
        onKeyDown={() => stir(0.1)}>
        <div style={{ ...kit.dim, backgroundColor: "rgba(8,6,4,0.72)" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        {/* 顶部：问题 + 最近的一问一驳 */}
        <div style={sc.top}>
          <div style={sc.asker}>{nb(speaker)}</div>
          <div style={kit.question}>{nb(phase.question)}</div>
          {step === 0 && lastTwo.map((s, i) => (
            <div key={said.length - lastTwo.length + i} style={{ ...sc.exchange, opacity: i === lastTwo.length - 1 ? 1 : 0.55 }}>
              <span style={sc.you}>{nb(s.text)}</span>
              <span style={sc.him}>{nb(s.rebuttal)}</span>
            </div>
          ))}
        </div>

        {/* 蜡烛 */}
        {step === 0 && (
          <svg viewBox="0 0 60 120" style={sc.candle} aria-hidden="true">
            <defs>
              <radialGradient id="scGlow" cx="50%" cy="40%" r="50%">
                <stop offset="0" stopColor="rgba(255,214,140,0.55)" /><stop offset="1" stopColor="rgba(255,214,140,0)" />
              </radialGradient>
            </defs>
            <circle cx="30" cy="34" r="30" fill="url(#scGlow)" />
            <g ref={candle} style={{ transformOrigin: "30px 48px", transformBox: "view-box" }}>
              <path d="M30 14 C38 28 38 40 30 48 C22 40 22 28 30 14 Z" fill="#FFD27A" />
              <path d="M30 26 C34 34 34 40 30 45 C26 40 26 34 30 26 Z" fill="#FFF3D6" />
            </g>
            <rect x="24" y="48" width="12" height="60" rx="2" fill="#EDE2CC" />
            <rect x="29.3" y="44" width="1.4" height="6" fill="#3A2E20" />
          </svg>
        )}

        {/* 飞转的句子 */}
        {step === 0 && chips.current.map((c) => c.state !== "gone" && (
          <button key={c.id} ref={(el) => { els.current[c.id] = el; }}
            onClick={() => speak(c)} tabIndex={c.state === "float" ? 0 : -1}
            onPointerEnter={() => { c.hover = true; }} onPointerLeave={() => { c.hover = false; }}
            onFocus={() => { c.hover = true; }} onBlur={() => { c.hover = false; }}
            style={{ ...sc.chip, ...(c.main ? sc.chipMain : null) }}>
            {nb(c.text)}
          </button>
        ))}

        {step === 0 && (
          <div style={{ ...sc.hint, opacity: calm && said.length > 0 && floatingLeft > 0 ? 0.9 : 0 }}>
            {t("……他在等。")}
          </div>
        )}

        {step >= 1 && (
          <div style={sc.panel}>
            <div style={kit.duo}>
              <div style={kit.card}>
                <div style={kit.cardLabel}>{t("你说出口的")}</div>
                <div style={kit.cardText}>
                  {said.length === 0
                    ? t("一句也没有——你从一开始就没有开口。")
                    : nb(t("{n} 句，都是书上的话。").replace("{n}", String(said.length)))}
                </div>
              </div>
              <div style={{ ...kit.card, ...kit.cardHim }}>
                <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("他在等的")}</div>
                <div style={kit.cardText}>{t("沉默。")}</div>
              </div>
            </div>
            {phase.silenceReveal && <div style={kit.reveal}>{nb(phase.silenceReveal)}</div>}
            {step === 1 ? (
              <button style={kit.go} onClick={() => setStep(2)}>{t("后来呢 →")}</button>
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

const sc = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    padding: "max(4%, 52px) 10% 0", textAlign: "center",
  },
  asker: { color: "#D9BB7E", fontSize: 13, letterSpacing: 6 },
  exchange: {
    display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxWidth: 820,
    fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.6, transition: "opacity 400ms ease",
  },
  you: { color: "rgba(226,211,180,0.75)", textDecoration: "line-through", textDecorationColor: "rgba(226,211,180,0.4)" },
  him: { color: "#F5E6D3" },
  candle: { position: "absolute", left: "50%", top: `${CY}%`, width: "5.5%", transform: "translate(-50%, -38%)", zIndex: 10, pointerEvents: "none" },
  chip: {
    position: "absolute", zIndex: 14, left: `${CX}%`, top: `${CY}%`, maxWidth: "26%",
    padding: "6px 12px", borderRadius: 16, border: "1px solid rgba(201,168,106,0.45)",
    backgroundColor: "rgba(30,24,18,0.72)", color: "#E9DCC2", cursor: "pointer",
    fontFamily: "var(--font-body)", fontSize: "clamp(12px, 0.94vw, 15.5px)", lineHeight: 1.45, letterSpacing: 1,
    whiteSpace: "normal", textAlign: "center", willChange: "left, top, opacity, transform",
  },
  chipMain: { backgroundColor: "rgba(246,236,214,0.92)", color: "#2B2118", borderColor: "#C9A86A" },
  hint: {
    position: "absolute", left: 0, right: 0, bottom: "7%", zIndex: 16, textAlign: "center", pointerEvents: "none",
    color: "#E2D3B4", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 6, transition: "opacity 1.2s ease",
  },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25, maxHeight: "62%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    padding: "3% 8% 2.5%",
  },
};
