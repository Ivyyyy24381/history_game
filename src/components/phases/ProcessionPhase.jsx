// ============================================================
// PROCESSION — 婚礼之夜（鲁米 · 1273：把信物还给给过他的人，再送他一程）
// ============================================================
// 两段：
//   1 回忆（★ retrieve to act）：病榻前摆着五样信物；五个一路见过的人只剩淡淡的影子。
//     把每样信物拖（或点选后点）到当年给他的那个人身上——对了，那个人亮起来，说出当年那句话。
//   2 送一程（◈ 过桥）：按住「送他一程」，送葬队伍往城门走；走着走着，街边不断有人加入——
//     基督徒、犹太人、希腊工匠、突厥士兵……然后问：为什么他们也来了？（▲）
//
// phase: {
//   background, legend?, situation,
//   people: [{ id, name, where, hat, color, beardColor?, keepsake, line }],
//   keepsakes: [{ id, kind, label }],
//   walkPrompt, mourners: [{ label, hat, color, cloth? }],
//   question, options: [{ id, text }], actual, reveal, consequence
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";
import ArtCard from "./ArtCard";
import { Traveler, Keepsake } from "./figures";

export default function ProcessionPhase({ phase, onScore, onComplete }) {
  const people = phase.people || [];
  const keepsakes = phase.keepsakes || [];
  const mourners = phase.mourners || [];
  const options = phase.options || [];
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(0);           // 0 回忆 · 1 送一程 · 2 猜 · 3 对照 · 4 后来
  const [placed, setPlaced] = useState({});      // personId → keepsakeId
  const [armed, setArmed] = useState(null);      // 点选模式：拿起的信物
  const [drag, setDrag] = useState(null);        // { id, x, y, moved }
  const [nope, setNope] = useState(null);        // 摇头的人
  const [talk, setTalk] = useState(null);        // 正在说话的人
  const [walk, setWalk] = useState(0);           // 0–1
  const [mine, setMine] = useState(null);
  const holding = useRef(false);
  const stage = useRef(null);

  const give = (kid, pid) => {
    const person = people.find((p) => p.id === pid);
    if (!person || placed[pid]) return;
    setArmed(null);
    if (person.keepsake === kid) {
      setPlaced((m) => ({ ...m, [pid]: kid }));
      setTalk(pid);
      if (onScore) onScore("recall:" + pid, POINTS.recall);
    } else {
      setNope(pid);
      setTimeout(() => setNope((n) => (n === pid ? null : n)), 900);
    }
  };
  const allPlaced = people.length > 0 && people.every((p) => placed[p.id]);

  // —— 拖信物 ——
  const kDown = (e, id) => {
    if (step !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = stage.current.getBoundingClientRect();
    setDrag({ id, x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false });
  };
  const sMove = (e) => {
    if (!drag) return;
    const r = stage.current.getBoundingClientRect();
    setDrag({ ...drag, x: e.clientX - r.left, y: e.clientY - r.top, moved: drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8 });
  };
  const sUp = (e) => {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (!d.moved) { setArmed((a) => (a === d.id ? null : d.id)); return; }
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.dataset && x.dataset.person);
    if (el) give(d.id, el.dataset.person);
  };

  // —— 送一程：按住往前走 ——
  useEffect(() => {
    if (step !== 1) return undefined;
    let raf = 0, prev = performance.now();
    const tick = (now) => {
      const dt = (now - prev) / 1000; prev = now;
      if (holding.current) setWalk((w) => Math.min(1, w + dt / 9));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  useEffect(() => { if (step === 1 && walk >= 1) { holding.current = false; setStep(2); } }, [walk, step]);
  const hold = (on) => { holding.current = on; };
  const joined = Math.min(mourners.length, Math.floor(walk * (mourners.length + 0.999)));

  const commit = (id) => { setMine(id); setStep(3); if (onScore) onScore("predict", POINTS.predict); };
  const actual = options.find((o) => o.id === phase.actual) || {};
  const chosen = options.find((o) => o.id === mine) || {};
  const talker = people.find((p) => p.id === talk);

  return (
    <div style={kit.outer}>
      <div ref={stage} onPointerMove={sMove} onPointerUp={sUp}
        style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})`, touchAction: "none" }}>
        <div style={{ ...kit.dim, backgroundColor: step === 0 ? "rgba(8,8,14,0.74)" : "rgba(10,12,20,0.5)" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        {step === 0 && (
          <>
            <div style={pc.top}>
              {phase.situation && <div style={{ ...kit.situation, maxWidth: 780 }}>{nb(phase.situation)}</div>}
              <div style={kit.hint}>{armed ? t("点一个人，把信物还给他") : t("把每样信物拖到当年给他的那个人身上。")}</div>
            </div>
            <div style={pc.people}>
              {people.map((p) => {
                const on = !!placed[p.id];
                return (
                  <button key={p.id} data-person={p.id} onClick={() => armed && give(armed, p.id)}
                    style={{ ...pc.person, cursor: armed ? "pointer" : "default", animation: nope === p.id && !reduced ? "pcNo 0.3s ease-in-out 2" : "none" }}>
                    <span data-person={p.id} style={{ ...pc.ghost, opacity: on ? 1 : 0.32, filter: on ? "none" : "grayscale(1) brightness(1.3)" }}>
                      <Traveler hat={p.hat} color={p.color} beardColor={p.beardColor} mood={on ? "calm" : "idle"} />
                    </span>
                    <span data-person={p.id} style={pc.pName}>{nb(p.name)}</span>
                    <span data-person={p.id} style={pc.pWhere}>{nb(p.where)}</span>
                    {on && <span style={pc.given}><Keepsake kind={(keepsakes.find((k) => k.id === placed[p.id]) || {}).kind} size={30} /></span>}
                  </button>
                );
              })}
            </div>
            {talker && (
              <div key={talker.id} style={{ ...pc.line, animation: reduced ? "none" : "pcIn 500ms ease" }} aria-live="polite">
                <span style={pc.lineWho}>{nb(talker.name)}</span>{nb(talker.line)}
              </div>
            )}
            <div style={pc.cloth}>
              {keepsakes.filter((k) => !Object.values(placed).includes(k.id)).map((k) => (
                <button key={k.id} onPointerDown={(e) => kDown(e, k.id)} aria-pressed={armed === k.id}
                  onClick={(e) => { if (e.detail === 0) setArmed((a) => (a === k.id ? null : k.id)); }}
                  style={{ ...pc.keep, ...(armed === k.id ? pc.keepOn : null), visibility: drag && drag.moved && drag.id === k.id ? "hidden" : "visible" }}>
                  <Keepsake kind={k.kind} size={46} />
                  <span style={pc.keepLabel}>{nb(k.label)}</span>
                </button>
              ))}
              {allPlaced && <button style={kit.go} onClick={() => { setTalk(null); setStep(1); }}>{t("第二天清晨 →")}</button>}
            </div>
            {drag && drag.moved && (
              <div style={{ position: "absolute", left: drag.x, top: drag.y, transform: "translate(-50%, -50%)", zIndex: 40, pointerEvents: "none" }}>
                <Keepsake kind={(keepsakes.find((k) => k.id === drag.id) || {}).kind} size={52} />
              </div>
            )}
          </>
        )}

        {step >= 1 && (
          <>
            <div style={pc.top}>
              {step === 1 && <div style={{ ...kit.situation, maxWidth: 760 }}>{nb(phase.walkPrompt)}</div>}
              <div style={pc.counter}>{t("送葬的人")}{"　"}<b style={{ fontVariantNumeric: "tabular-nums" }}>{4 + joined * 3}</b></div>
            </div>
            {/* 城门 */}
            <div style={pc.gate} aria-hidden="true" />
            {/* 队伍：棺架在前，越走越长 */}
            <div style={{ ...pc.road, transform: `translateX(${-walk * 38}%)` }}>
              <div style={pc.bier} aria-hidden="true">
                <svg viewBox="0 0 160 70" width="100%" height="100%">
                  <rect x="10" y="30" width="140" height="10" rx="3" fill="#6B4A2E" />
                  <path d="M22 30 C40 6 120 6 138 30 Z" fill="#2F6F4A" stroke="#1E4A30" strokeWidth="2" />
                  <path d="M60 14 C70 10 90 10 100 14" stroke="#E9C46A" strokeWidth="2" fill="none" />
                  {[24, 56, 104, 136].map((x) => <rect key={x} x={x - 3} y="40" width="6" height="26" fill="#3E2A1E" />)}
                </svg>
              </div>
              {people.filter((p) => p.walks).map((p) => (
                <div key={p.id} style={pc.walker}><Traveler hat={p.hat} color={p.color} beardColor={p.beardColor} mood="calm" /></div>
              ))}
              {mourners.slice(0, joined).map((m, i) => (
                <div key={i} style={{ ...pc.walker, animation: reduced ? "none" : "pcIn 700ms ease",
                  transform: reduced ? "none" : `translateY(${(Math.sin(walk * 60 + i * 1.3) * 3).toFixed(1)}px)` }}>
                  <Traveler hat={m.hat} color={m.color} cloth={m.cloth} mood="calm" />
                  <span style={pc.mLabel}>{nb(m.label)}</span>
                </div>
              ))}
            </div>
            {step === 1 && (
              <button style={pc.holdBtn}
                onPointerDown={() => hold(true)} onPointerUp={() => hold(false)} onPointerLeave={() => hold(false)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); hold(true); } }}
                onKeyUp={() => hold(false)}>
                {t("按住：送他一程")}
                <span style={{ ...pc.holdBar, width: `${walk * 100}%` }} />
              </button>
            )}
          </>
        )}

        {step === 2 && (
          <div style={pc.panel}>
            <div style={kit.question}>{nb(phase.question)}</div>
            <div style={kit.opts}>{options.map((o) => <button key={o.id} style={kit.opt} onClick={() => commit(o.id)}>{nb(o.text)}</button>)}</div>
          </div>
        )}
        {step >= 3 && (
          <div style={pc.panel}>
            <div style={kit.duo}>
              <div style={kit.card}><div style={kit.cardLabel}>{t("你猜")}</div><div style={kit.cardText}>{nb(chosen.text || "")}</div></div>
              <div style={{ ...kit.card, ...kit.cardHim }}><div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("据后世传记")}</div><div style={kit.cardText}>{nb(actual.text || "")}</div></div>
            </div>
            {phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)" }}>{nb(phase.reveal)}</div>}
            {step === 3
              ? <button style={kit.go} onClick={() => setStep(4)}>{t("后来呢 →")}</button>
              : <>{phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}{phase.artCard && <ArtCard src={phase.artCard} />}<button style={kit.go} onClick={onComplete}>{t("继续 →")}</button></>}
          </div>
        )}
        <style>{`
          @keyframes pcNo { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-6px) } }
          @keyframes pcIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        `}</style>
      </div>
    </div>
  );
}

const pc = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "max(3%, 48px) 10% 0", textAlign: "center",
  },
  people: { position: "absolute", left: "4%", right: "4%", top: "24%", height: "38%", zIndex: 12, display: "flex", justifyContent: "space-around", alignItems: "flex-end" },
  person: {
    position: "relative", width: "16%", height: "100%", padding: 0, border: "none", background: "none",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 2, fontFamily: "var(--font-body)",
  },
  ghost: { width: "72%", height: "70%", transition: "opacity 700ms ease, filter 700ms ease" },
  pName: { color: "#F5E6D3", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 2 },
  pWhere: { color: "rgba(226,211,180,0.75)", fontSize: 12, letterSpacing: 1 },
  given: { position: "absolute", right: "4%", bottom: "30%" },
  line: {
    position: "absolute", left: "50%", top: "64%", transform: "translateX(-50%)", zIndex: 22, maxWidth: "70%",
    padding: "8px 18px", borderRadius: 10, backgroundColor: "rgba(246,236,214,0.95)", color: "#2B2118",
    borderLeft: "3px solid #C9A86A", fontSize: "clamp(13px, 1.1vw, 18px)", lineHeight: 1.6,
  },
  lineWho: { color: "#8A6A2E", fontSize: 13, letterSpacing: 2, marginRight: 10 },
  cloth: {
    position: "absolute", left: "10%", right: "10%", bottom: "4%", height: "20%", zIndex: 14, borderRadius: 12,
    background: "linear-gradient(#2F4A3A, #22382C)", border: "2px solid #4E6E58",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "3%", padding: "0 3%",
  },
  keep: {
    minWidth: 70, minHeight: 44, padding: "6px 8px", borderRadius: 10, border: "1px dashed rgba(233,220,194,0.35)",
    background: "rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    cursor: "grab", touchAction: "none", fontFamily: "var(--font-body)",
  },
  keepOn: { borderStyle: "solid", borderColor: "#E9C46A", background: "rgba(233,196,106,0.18)" },
  keepLabel: { color: "#EFE3CC", fontSize: 12, letterSpacing: 1 },
  counter: { color: "#F5E6D3", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 3, textShadow: "0 2px 10px rgba(0,0,0,0.9)" },
  gate: {
    position: "absolute", left: "2%", bottom: "14%", width: "11%", height: "46%", zIndex: 9,
    borderRadius: "50% 50% 0 0 / 30% 30% 0 0", border: "10px solid #8A7A62", borderBottom: "none",
    background: "linear-gradient(rgba(255,230,170,0.25), rgba(255,230,170,0.05))",
  },
  road: {
    position: "absolute", left: "18%", bottom: "20%", height: "30%", zIndex: 12, display: "flex", alignItems: "flex-end", gap: 6,
    transition: "transform 120ms linear",
  },
  bier: { width: 190, height: "70%", flex: "0 0 auto" },
  walker: { position: "relative", width: 76, height: "62%", flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" },
  mLabel: { position: "absolute", top: "100%", marginTop: 4, width: 84, textAlign: "center", color: "#F5E6D3", fontSize: 11, lineHeight: 1.3, letterSpacing: 1, textShadow: "0 1px 6px rgba(0,0,0,0.9)" },
  holdBtn: {
    position: "absolute", left: "50%", bottom: "4%", transform: "translateX(-50%)", zIndex: 24, overflow: "hidden",
    minHeight: 48, padding: "12px 34px", borderRadius: 24, border: "1px solid #C9A86A",
    backgroundColor: "rgba(252,248,238,0.9)", color: "#3A2E20", cursor: "pointer", userSelect: "none", touchAction: "none",
    fontFamily: "var(--font-body)", fontSize: "clamp(13px, 1.1vw, 18px)", letterSpacing: 3,
  },
  holdBar: { position: "absolute", left: 0, bottom: 0, height: 4, backgroundColor: "#B4762F" },
  panel: {
    position: "absolute", left: 0, right: 0, top: 0, zIndex: 26, maxHeight: "60%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "max(3%, 48px) 8% 2%",
    background: "linear-gradient(to bottom, rgba(10,7,4,0.92), rgba(10,7,4,0.78) 75%, rgba(10,7,4,0))",
  },
};
