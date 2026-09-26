// ============================================================
// LINK MATCH — 连线，提交，再和实际并排（鲁米 · 四人争葡萄）
// ============================================================
// 不是「连对几条」的配对题：玩家先按自己的理解连，提交后自己的线变成虚线留在原地，
// 实际的线用实线画上去。差额本身是教材——
// 四人争葡萄里，玩家多半以为四个人在争四样东西，实际四条线全落在同一串葡萄上。
//
// 操作：先点左边一张，再点右边一张（反过来也行）。点已连好的左卡可以改连。
// 右边一张卡可以被多条线连（many → one），这正是这一关要的形状。
//
// phase: {
//   background, legend?, situation, question,
//   left:  [{ id, who?, text }],
//   right: [{ id, text, sub? }],
//   answer: { [leftId]: rightId },
//   sameNote, diffNote, reveal, consequence, himLabel?
// }
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";

export default function LinkMatchPhase({ phase, onScore, onComplete }) {
  const left = phase.left || [];
  const right = phase.right || [];
  const answer = phase.answer || {};
  const [links, setLinks] = useState({}); // leftId → rightId
  const [active, setActive] = useState(null); // { side: "l"|"r", id }
  const [step, setStep] = useState(0); // 0 连 · 1 对照 · 2 后来
  const reduced = usePrefersReducedMotion();

  const board = useRef(null);
  const refs = useRef({});
  const [pos, setPos] = useState({}); // key → { x, y }

  const measure = useCallback(() => {
    const b = board.current;
    if (!b) return;
    const br = b.getBoundingClientRect();
    const next = {};
    for (const [key, el] of Object.entries(refs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const isLeft = key.startsWith("l:");
      next[key] = { x: (isLeft ? r.right : r.left) - br.left, y: r.top + r.height / 2 - br.top };
    }
    setPos(next);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (board.current) ro.observe(board.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure, step]);

  const link = (l, r) => {
    setLinks((m) => ({ ...m, [l]: r }));
    setActive(null);
  };
  const pickLeft = (id) => {
    if (step > 0) return;
    if (active && active.side === "r") return link(id, active.id);
    setActive(active && active.side === "l" && active.id === id ? null : { side: "l", id });
  };
  const pickRight = (id) => {
    if (step > 0) return;
    if (active && active.side === "l") return link(active.id, id);
    setActive(active && active.side === "r" && active.id === id ? null : { side: "r", id });
  };

  const allLinked = left.every((l) => links[l.id]);
  const agree = left.filter((l) => links[l.id] === answer[l.id]).length;
  const commit = () => {
    setStep(1);
    setActive(null);
    // 给「敢连」这个动作本身——按连对几条给分，玩家就会退回揣摩标准答案
    if (onScore) onScore("link", POINTS.link);
  };

  const nameOf = (id) => (right.find((r) => r.id === id) || {}).text || "";
  const line = (l, r, style, key) => {
    const a = pos["l:" + l], b = pos["r:" + r];
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    return <path key={key} d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} fill="none" {...style} />;
  };

  return (
    <div style={kit.outer}>
      <div style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})` }}>
        <div style={kit.dim} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}
        <div style={{ ...kit.wrap, justifyContent: "flex-start", paddingTop: "max(4%, 48px)" }}>
          {phase.situation && <div style={kit.situation}>{nb(phase.situation)}</div>}
          <div style={kit.question}>{nb(phase.question)}</div>

          <div ref={board} style={lm.board}>
            <svg style={lm.svg} aria-hidden="true">
              {step === 0 && left.map((l) => links[l.id] && line(l.id, links[l.id],
                { stroke: "#D9BB7E", strokeWidth: 3, strokeLinecap: "round" }, "m" + l.id))}
              {step >= 1 && left.map((l) => links[l.id] && line(l.id, links[l.id],
                { stroke: "rgba(226,211,180,0.55)", strokeWidth: 2.5, strokeDasharray: "7 7" }, "g" + l.id))}
              {step >= 1 && left.map((l) => answer[l.id] && line(l.id, answer[l.id],
                { stroke: "#E9C46A", strokeWidth: 3.5, strokeLinecap: "round",
                  style: reduced ? undefined : { strokeDasharray: 1200, strokeDashoffset: 1200, animation: "lmDraw 1.4s ease forwards" } },
                "a" + l.id))}
            </svg>

            <div style={lm.col}>
              {left.map((l) => {
                const on = active && active.side === "l" && active.id === l.id;
                return (
                  <button key={l.id} ref={(el) => { refs.current["l:" + l.id] = el; }}
                    onClick={() => pickLeft(l.id)} aria-pressed={on}
                    style={{ ...lm.card, ...(on ? lm.cardOn : null), ...(step > 0 ? lm.cardDone : null) }}>
                    {l.who && <span style={lm.who}>{nb(l.who)}</span>}
                    <span style={lm.text}>{nb(l.text)}</span>
                    {step === 0 && links[l.id] && <span style={lm.chip}>{"→ " + nameOf(links[l.id])}</span>}
                    {step >= 1 && (
                      <span style={lm.chip}>
                        {t("你连")}{"：" + nameOf(links[l.id]) + "　"}{t("实际")}{"：" + nameOf(answer[l.id])}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={lm.col}>
              {right.map((r) => {
                const on = active && active.side === "r" && active.id === r.id;
                const n = Object.values(links).filter((x) => x === r.id).length;
                return (
                  <button key={r.id} ref={(el) => { refs.current["r:" + r.id] = el; }}
                    onClick={() => pickRight(r.id)} aria-pressed={on}
                    style={{ ...lm.card, ...lm.cardRight, ...(on ? lm.cardOn : null), ...(step > 0 ? lm.cardDone : null) }}>
                    {r.sub && <span style={lm.sub}>{nb(r.sub)}</span>}
                    <span style={lm.text}>{nb(r.text)}</span>
                    {step === 0 && n > 0 && <span style={lm.count}>{"×" + n}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {step === 0 && (
            allLinked
              ? <button style={kit.go} onClick={commit}>{t("就这样连 →")}</button>
              : <div style={kit.hint}>{t("先点左边一张，再点右边一张。连好的可以改。")}</div>
          )}

          {step >= 1 && (
            <>
              <div style={kit.note}>
                {nb(agree === left.length
                  ? (phase.sameNote || t("你的线和实际完全重合。"))
                  : (phase.diffNote || t("虚线是你连的，实线是实际的。")))}
              </div>
              {phase.reveal && <div style={kit.reveal}>{nb(phase.reveal)}</div>}
              {step === 1 ? (
                <button style={kit.go} onClick={() => setStep(2)}>{t("后来呢 →")}</button>
              ) : (
                <>
                  {phase.consequence && <div style={kit.consequence}>{nb(phase.consequence)}</div>}
                  <button style={kit.go} onClick={onComplete}>{t("继续 →")}</button>
                </>
              )}
            </>
          )}
        </div>
        <style>{`@keyframes lmDraw { to { stroke-dashoffset: 0 } }`}</style>
      </div>
    </div>
  );
}

const lm = {
  board: {
    position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center",
    width: "100%", maxWidth: 820, gap: "18%", margin: "6px 0",
  },
  svg: { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: 1 },
  col: { position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 12, flex: "1 1 0" },
  card: {
    minHeight: 48, padding: "10px 14px", borderRadius: 10, textAlign: "left",
    backgroundColor: "rgba(252,248,238,0.94)", color: "#2B2118",
    border: "2px solid rgba(201,168,106,0.5)", cursor: "pointer", fontFamily: "var(--font-body)",
    display: "flex", flexDirection: "column", gap: 2,
    transition: "border-color 160ms ease, box-shadow 160ms ease",
  },
  cardRight: { alignItems: "center", textAlign: "center", position: "relative" },
  cardOn: { borderColor: "#B4762F", boxShadow: "0 0 0 3px rgba(233,196,106,0.55)" },
  cardDone: { cursor: "default" },
  who: { fontSize: 12, letterSpacing: 3, color: "#6E5F45" },
  text: { fontSize: "clamp(13px, 1.11vw, 18px)", letterSpacing: 1, lineHeight: 1.5 },
  sub: { fontSize: "clamp(18px, 1.6vw, 26px)", lineHeight: 1.2 },
  chip: { fontSize: 12, color: "#8A5A1E", letterSpacing: 1, marginTop: 2 },
  count: {
    position: "absolute", top: 6, right: 8, fontSize: 12, color: "#8A5A1E", letterSpacing: 1,
  },
};
