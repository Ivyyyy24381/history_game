// ============================================================
// EAVESDROP — 贴着墙偷听（鲁米 · 1219 撒马尔罕：为什么要走？）
// ============================================================
// 市集的土墙后面，好几拨人在说话。玩家把耳朵贴在墙上左右挪：
// 离谁近，谁的话就越清楚（远处只是一团模糊的·····）。在一处贴够一秒，这句话就「记下」进证据袋。
// 记够几句之后下判断：从自己亲耳听到的话里，挑出真能说明问题的——
// 干扰项是「真的，但不相干」，和 evidence_select 同一个规矩。
//
// phase: {
//   background, legend?, situation, instruction,
//   voices: [{ id, x（沿墙位置 0–100）, who, text, supports: bool, why }],
//   need（记下几句才能下判断）, claim, pick（挑几条）,
//   reveal, consequence
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";
import { Traveler } from "./figures";

const R = 13;          // 听得见的半径（沿墙百分比）
const CLEAR = 0.8;     // 清晰到这个程度才开始计时
const HOLD_MS = 1000;  // 贴住这么久算记下

// 把一句话按清晰度「蒙上」：听不清的字换成 ·（同一个位置每次换成一样的，不闪）
function muffle(text, c) {
  if (c >= 0.98) return text;
  return Array.from(text).map((ch, i) => {
    if ("「」，。！？、".includes(ch)) return ch;
    const h = ((i * 2654435761) >>> 0) % 1000 / 1000;
    return h < c * c ? ch : "·";
  }).join("");
}

export default function EavesdropPhase({ phase, onScore, onComplete }) {
  const voices = phase.voices || [];
  const need = Math.min(phase.need || voices.length, voices.length);
  const pick = phase.pick || voices.filter((v) => v.supports).length || 2;
  const reduced = usePrefersReducedMotion();

  const [earX, setEarX] = useState(8);
  const [got, setGot] = useState([]);          // 记下的 voice id（按顺序）
  const [step, setStep] = useState(0);         // 0 听 · 1 判断 · 2 对照 · 3 后来
  const [chosen, setChosen] = useState([]);
  const holdStart = useRef({});                // voiceId → ms
  const [now, setNow] = useState(performance.now());
  const stage = useRef(null);

  useEffect(() => {
    if (step !== 0) return undefined;
    let raf = 0;
    const tick = (tNow) => { setNow(tNow); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const clarity = (v) => Math.max(0, 1 - Math.abs(earX - v.x) / R);

  // 贴住计时 → 记下
  useEffect(() => {
    if (step !== 0) return;
    for (const v of voices) {
      if (got.includes(v.id)) continue;
      const c = clarity(v);
      if (c >= CLEAR) {
        if (!holdStart.current[v.id]) holdStart.current[v.id] = now;
        else if (now - holdStart.current[v.id] >= HOLD_MS) {
          setGot((g) => (g.includes(v.id) ? g : [...g, v.id]));
          if (onScore) onScore("heard:" + v.id, POINTS.clue);
        }
      } else {
        holdStart.current[v.id] = 0;
      }
    }
  });

  const onMove = (e) => {
    if (step !== 0) return;
    const r = stage.current.getBoundingClientRect();
    setEarX(Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)));
  };
  const onKey = (e) => {
    if (step !== 0) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); setEarX((x) => Math.max(2, x - 2)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setEarX((x) => Math.min(98, x + 2)); }
  };

  const toggle = (id) => {
    if (step !== 1) return;
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < pick ? [...c, id] : c));
  };
  const submit = () => {
    setStep(2);
    const good = chosen.filter((id) => (voices.find((v) => v.id === id) || {}).supports).length;
    if (onScore && good) onScore("evidence", POINTS.evidence * good);
  };

  const byId = Object.fromEntries(voices.map((v) => [v.id, v]));
  const bag = got.map((id) => byId[id]);

  return (
    <div style={kit.outer}>
      <div ref={stage} tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerDown={onMove}
        style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})`, outline: "none", touchAction: "none" }}
        aria-label={t("用左右方向键沿着墙挪动耳朵")}>
        <div style={{ ...kit.dim, backgroundColor: "rgba(12,8,5,0.5)" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        <div style={ev.top}>
          {phase.situation && step === 0 && <div style={{ ...kit.situation, maxWidth: 820 }}>{nb(phase.situation)}</div>}
          {step === 0 && (
            <div style={kit.hint}>{nb(phase.instruction || t("把耳朵贴在墙上，左右挪动。"))}{`　${t("记下")} ${got.length} / ${need}`}</div>
          )}
        </div>

        {/* 墙后面的人：只露出头顶的影子 */}
        {step === 0 && voices.map((v) => {
          const c = clarity(v);
          const heard = got.includes(v.id);
          const holding = !heard && holdStart.current[v.id] ? Math.min(1, (now - holdStart.current[v.id]) / HOLD_MS) : 0;
          return (
            <div key={v.id} style={{ ...ev.voice, left: `${v.x}%` }}>
              <div style={{
                ...ev.bubble,
                opacity: 0.25 + 0.75 * Math.max(c, heard ? 0.5 : 0),
                filter: reduced ? "none" : `blur(${((1 - c) * 2.2).toFixed(2)}px)`,
                borderColor: heard ? "#9FC39A" : "rgba(201,168,106,0.6)",
              }}>
                {heard && <span style={ev.who}>{nb(v.who)}</span>}
                <span>{heard ? nb(v.text) : muffle(v.text, c)}</span>
                {holding > 0 && <span style={{ ...ev.holdBar, width: `${holding * 100}%` }} />}
              </div>
              <div style={{ ...ev.head, opacity: 0.35 + 0.4 * c }}>
                <Traveler hat={v.hat || "turban"} color={v.color || "#3A3028"} mood={c > 0.5 ? "talk" : "idle"} />
              </div>
            </div>
          );
        })}

        {/* 墙 */}
        <div style={ev.wall} aria-hidden="true" />

        {/* 耳朵 */}
        {step === 0 && (
          <div style={{ ...ev.ear, left: `${earX}%` }} aria-hidden="true">
            <svg viewBox="0 0 40 56" width="100%" height="100%">
              <path d="M28 8 C14 0 2 12 6 26 C8 34 14 36 14 44 C14 52 22 54 26 48" fill="#D9A77E" stroke="#7A4A2A" strokeWidth="2.5" />
              <path d="M24 18 C18 14 12 20 16 26 C18 30 22 30 20 36" fill="none" stroke="#7A4A2A" strokeWidth="2" />
            </svg>
          </div>
        )}

        {/* 证据袋 */}
        {step === 0 && bag.length > 0 && (
          <div style={ev.bag} aria-live="polite">
            <div style={ev.bagTitle}>{t("你听到的")}</div>
            {bag.map((v) => (
              <div key={v.id} style={ev.bagItem}><b style={ev.bagWho}>{nb(v.who)}</b>{nb(v.text)}</div>
            ))}
            {got.length >= need && <button style={{ ...kit.go, marginTop: 6 }} onClick={() => setStep(1)}>{t("下个判断 →")}</button>}
          </div>
        )}

        {step >= 1 && (
          <div style={ev.judge}>
            <div style={kit.question}>{nb(phase.claim)}</div>
            <div style={kit.hint}>{nb(t("从你亲耳听到的话里，挑出 {n} 句真能说明这一点的。").replace("{n}", String(pick)))}</div>
            <div style={ev.cards}>
              {bag.map((v) => {
                const on = chosen.includes(v.id);
                return (
                  <button key={v.id} onClick={() => toggle(v.id)} aria-pressed={on}
                    style={{ ...ev.card, ...(on ? ev.cardOn : null), cursor: step === 1 ? "pointer" : "default" }}>
                    <span style={ev.cardWho}>{nb(v.who)}</span>
                    <span>{nb(v.text)}</span>
                    {step >= 2 && (
                      <span style={{ ...ev.why, color: v.supports ? "#2F6B3A" : "#7A5A2A" }}>
                        {v.supports ? t("能说明") : t("真的，但说明不了")}{"　"}{nb(v.why || "")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {step === 1 && (
              <button style={{ ...kit.go, opacity: chosen.length === pick ? 1 : 0.5 }} disabled={chosen.length !== pick} onClick={submit}>
                {t("就是这几句 →")}
              </button>
            )}
            {step >= 2 && phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)" }}>{nb(phase.reveal)}</div>}
            {step === 2 && <button style={kit.go} onClick={() => setStep(3)}>{t("后来呢 →")}</button>}
            {step === 3 && (
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

const ev = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "max(3%, 48px) 10% 0", textAlign: "center",
  },
  // 站在墙后：头的下半截被墙挡住，气泡在头顶
  voice: { position: "absolute", bottom: "41%", width: "15%", transform: "translateX(-50%)", zIndex: 9, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" },
  bubble: {
    position: "relative", width: "100%", padding: "7px 10px", borderRadius: 10, overflow: "hidden",
    backgroundColor: "rgba(252,248,238,0.93)", color: "#2B2118", border: "1.5px solid",
    fontSize: "clamp(11.5px, 0.9vw, 15px)", lineHeight: 1.5, textAlign: "left",
    display: "flex", flexDirection: "column", gap: 2, minHeight: 56,
  },
  who: { fontSize: 12, letterSpacing: 2, color: "#2F6B3A" },
  holdBar: { position: "absolute", left: 0, bottom: 0, height: 3, backgroundColor: "#9FC39A" },
  head: { width: "56%", height: "15vh", maxHeight: 140, marginTop: 4 },
  wall: {
    position: "absolute", left: 0, right: 0, top: "52%", height: "26%", zIndex: 10,
    background:
      "repeating-linear-gradient(0deg, rgba(90,60,30,0.35) 0 2px, transparent 2px 26px)," +
      "repeating-linear-gradient(90deg, rgba(90,60,30,0.25) 0 2px, transparent 2px 64px)," +
      "linear-gradient(#C49A64, #9E7646)",
    borderTop: "6px solid #8A6438", boxShadow: "0 -6px 18px rgba(0,0,0,0.35)",
  },
  ear: { position: "absolute", top: "57%", width: "3.2%", height: "9%", transform: "translateX(-50%)", zIndex: 12, pointerEvents: "none", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" },
  bag: {
    position: "absolute", left: "3%", right: "3%", bottom: "3%", zIndex: 16, maxHeight: "18%", overflowY: "auto",
    display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 10,
    backgroundColor: "rgba(20,15,10,0.78)", border: "1px solid rgba(201,168,106,0.5)",
  },
  bagTitle: { color: "#D9BB7E", fontSize: 12, letterSpacing: 3, marginRight: 4 },
  bagItem: { color: "#EFE3CC", fontSize: "clamp(11.5px, 0.85vw, 14px)", lineHeight: 1.5, padding: "3px 8px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)" },
  bagWho: { color: "#9FC39A", fontWeight: "normal", marginRight: 6 },
  judge: {
    position: "absolute", inset: 0, zIndex: 25, overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center",
    padding: "max(4%, 52px) 7% 3%", backgroundColor: "rgba(10,7,4,0.93)",
  },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, width: "100%", maxWidth: 900 },
  card: {
    display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", borderRadius: 10, textAlign: "left",
    backgroundColor: "rgba(252,248,238,0.92)", color: "#2B2118", border: "2px solid rgba(201,168,106,0.4)",
    fontFamily: "var(--font-body)", fontSize: "clamp(12.5px, 0.97vw, 16px)", lineHeight: 1.6,
  },
  cardOn: { borderColor: "#B4762F", boxShadow: "0 0 0 3px rgba(233,196,106,0.5)" },
  cardWho: { fontSize: 12, letterSpacing: 2, color: "#6E5F45" },
  why: { fontSize: "clamp(12px, 0.86vw, 14px)", lineHeight: 1.6, borderTop: "1px dashed rgba(110,95,69,0.4)", paddingTop: 4, marginTop: 2 },
};
