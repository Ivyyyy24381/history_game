// ============================================================
// DARK EXPLORE — 黑屋里摸东西：只看得见烛光一小圈（鲁米 · 黑暗中的大象）
// ============================================================
// 玩家手里只有一小圈烛光，跟屋里那些人一样，一次只摸得到一部分。
// 每摸到一处，就记下「摸到这里的人怎么说」——都是真话，但都只是一部分。
// 摸够 need 处之后先下判断「屋里到底是什么」，提交了才点灯：
// 你的猜测和实际并排，然后才给出鲁米那句「要是每人手里都有一支蜡烛……」。
// 机制本身就是寓言：玩家是把几个片面的说法拼起来，才猜到整体的。
//
// phase: {
//   image（整幅场景，16:9）, legend?, situation, instruction,
//   candle = 8（烛光半径，占画面宽度 %）,
//   spots: [{ id, x, y, r?（热区半径 %，默认 6）, part, who?, claim }],
//   need（摸到几处才能下判断，默认全部）,
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

export default function DarkExplorePhase({ phase, onScore, onComplete }) {
  const spots = phase.spots || [];
  const need = Math.min(phase.need || spots.length, spots.length);
  const options = phase.options || [];
  const candle = phase.candle || 8;
  const reduced = usePrefersReducedMotion();

  const [found, setFound] = useState([]); // 按摸到的顺序
  const [step, setStep] = useState(0); // 0 摸 · 1 猜 · 2 点灯对照 · 3 后来
  const [mine, setMine] = useState(null);
  const stage = useRef(null);
  const canvas = useRef(null);
  const cursor = useRef({ x: 50, y: 62 }); // 百分比
  const raf = useRef(0);

  // 画黑幕：整块涂黑，再按烛光和已摸到的地方挖出柔边的洞
  const draw = useCallback(() => {
    const cv = canvas.current, st = stage.current;
    if (!cv || !st) return;
    const w = st.clientWidth, h = st.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(6,4,2,0.992)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-out";
    const hole = (px, py, rPct, strength) => {
      const x = (px / 100) * w, y = (py / 100) * h, r = (rPct / 100) * w;
      const grad = g.createRadialGradient(x, y, r * 0.25, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // 摸过的地方留一点余温——玩家能看见自己已经拼出了哪几块
    for (const id of found) {
      const s = spots.find((z) => z.id === id);
      if (s) hole(s.x, s.y, (s.r || 6) * 0.9, 0.55);
    }
    hole(cursor.current.x, cursor.current.y, candle, 1);
  }, [found, spots, candle]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  const moveTo = (x, y) => {
    cursor.current = { x, y };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  };
  const onPointer = (e) => {
    if (step > 0) return;
    const r = stage.current.getBoundingClientRect();
    moveTo(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  };

  const touch = (s) => {
    if (step > 0) return;
    moveTo(s.x, s.y);
    if (found.includes(s.id)) return;
    setFound((xs) => [...xs, s.id]);
    if (onScore) onScore("darkSpot:" + s.id, POINTS.darkSpot);
  };

  const commit = (id) => {
    setMine(id);
    setStep(2);
    if (onScore) onScore("predict", POINTS.predict);
  };

  const actual = options.find((o) => o.id === phase.actual) || options[0] || {};
  const chosen = options.find((o) => o.id === mine) || {};
  const lit = step >= 2;

  return (
    <div style={kit.outer}>
      <div ref={stage} style={{ ...kit.stage, backgroundImage: `url(${asset(phase.image)})`, cursor: step === 0 ? "crosshair" : "default" }}
        onPointerMove={onPointer} onPointerDown={onPointer}>
        {/* 热区在黑幕下面；黑幕不吃指针事件，点击穿过去 */}
        {step === 0 && spots.map((s, i) => (
          <button key={s.id} onClick={() => touch(s)} onFocus={() => moveTo(s.x, s.y)}
            aria-label={t("在黑暗里摸一摸") + ` ${i + 1}`}
            style={{
              ...de.spot,
              left: `${s.x}%`, top: `${s.y}%`,
              width: `${(s.r || 6) * 2}%`,
            }} />
        ))}
        <canvas ref={canvas} aria-hidden="true" style={{
          ...de.veil,
          opacity: lit ? 0 : 1,
          transition: reduced ? "none" : "opacity 2.2s ease",
        }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        {/* 顶部：处境 + 指引 */}
        {step === 0 && (
          <div style={de.top}>
            {phase.situation && <div style={kit.situation}>{nb(phase.situation)}</div>}
            <div style={kit.hint}>
              {nb(phase.instruction || t("移动烛光，在黑暗里摸一摸。"))}
              {`　${found.length} / ${need}`}
            </div>
          </div>
        )}

        {/* 右侧：摸到的人各自怎么说 */}
        {found.length > 0 && step < 2 && (
          <div style={de.notes} aria-live="polite">
            {found.map((id) => {
              const s = spots.find((z) => z.id === id);
              return (
                <div key={id} style={de.note}>
                  <span style={de.part}>{nb((s.who || t("摸到{part}的人")).replace("{part}", s.part || ""))}</span>
                  <span>{nb(s.claim)}</span>
                </div>
              );
            })}
            {step === 0 && found.length >= need && (
              <button style={{ ...kit.go, marginTop: 6 }} onClick={() => setStep(1)}>{t("下个判断 →")}</button>
            )}
          </div>
        )}

        {step === 1 && (
          <div style={{ ...kit.wrap, background: "rgba(8,5,3,0.55)" }}>
            <div style={kit.question}>{nb(phase.question)}</div>
            <div style={kit.opts}>
              {options.map((o) => (
                <button key={o.id} style={kit.opt} onClick={() => commit(o.id)}>{nb(o.text)}</button>
              ))}
            </div>
            <div style={kit.hint}>{t("先猜，再点灯。")}</div>
          </div>
        )}

        {step >= 2 && (
          <div style={de.result}>
            <div style={kit.duo}>
              <div style={kit.card}>
                <div style={kit.cardLabel}>{t("你猜")}</div>
                <div style={kit.cardText}>{nb(chosen.text || "")}</div>
              </div>
              <div style={{ ...kit.card, ...kit.cardHim }}>
                <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("点灯之后")}</div>
                <div style={kit.cardText}>{nb(actual.text || "")}</div>
              </div>
            </div>
            <div style={kit.note}>
              {nb(mine === phase.actual
                ? (phase.sameNote || t("你把几块拼成了整体。"))
                : (phase.diffNote || t("每一块都是真的，只是都不完整。")))}
            </div>
            {phase.reveal && <div style={kit.reveal}>{nb(phase.reveal)}</div>}
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
      </div>
    </div>
  );
}

const de = {
  spot: {
    position: "absolute", zIndex: 5, aspectRatio: "1 / 1", transform: "translate(-50%, -50%)",
    borderRadius: "50%", border: "none", background: "transparent", cursor: "crosshair", padding: 0,
  },
  veil: { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 8, pointerEvents: "none" },
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 12, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "max(3%, 48px) 20% 0", textAlign: "center",
  },
  notes: {
    position: "absolute", right: "2.5%", top: "18%", zIndex: 12, width: "min(30%, 360px)",
    display: "flex", flexDirection: "column", gap: 8,
  },
  note: {
    padding: "8px 12px", borderRadius: 8, textAlign: "left",
    backgroundColor: "rgba(246,236,214,0.94)", color: "#2B2118", borderLeft: "3px solid #C9A86A",
    fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.6, display: "flex", flexDirection: "column",
  },
  part: { fontSize: 12, letterSpacing: 2, color: "#6E5F45" },
  result: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, maxHeight: "62%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    padding: "4% 8% 2.5%",
    background: "linear-gradient(to top, rgba(10,7,4,0.94) 0%, rgba(10,7,4,0.86) 70%, rgba(10,7,4,0) 100%)",
  },
};
