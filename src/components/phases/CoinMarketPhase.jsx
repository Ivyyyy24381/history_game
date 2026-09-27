// ============================================================
// COIN MARKET — 一枚银币，四个吵架的人（鲁米 · 《玛斯纳维》卷二「四人争葡萄」）
// ============================================================
// 四个旅伴只有一枚银币，各喊各的：angur！ʿinab！üzüm！istafil！快打起来了。
// 你站在果摊前，手里就这一枚银币——只够买一样。
//
//   · 点一个人：他比划着说那东西什么样（线索，每条单看都不够）
//   · 把银币拖到（或点选后点）一样水果上：买下来给他们看
//     买错了：四个人一起摇头、吵得更凶，摊主翻个白眼把钱退你
//     买对了：四个人同时喊出自己的词——原来说的是同一样东西
//
// 认知动作：收集证据 → 形成假设 → 用一次购买去检验 → 修正（★）。
// 真正的「啊哈」是意识到四个词可能是同一个东西；吵到第二轮时才给一句提示。
//
// phase: {
//   background, legend?, situation, goal,
//   travelers: [{ id, who, word, clue, color, hat: "turban"|"headcloth"|"furcap"|"pilos" }],
//   fruits:    [{ id, name, kind: "grape"|"fig"|"pomegranate"|"melon" }],
//   answer（fruit id）, vendorLine, hint,
//   reveal, consequence
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";
import { Fruit, Traveler } from "./figures";

export default function CoinMarketPhase({ phase, onScore, onComplete }) {
  const travelers = phase.travelers || [];
  const fruits = phase.fruits || [];
  const reduced = usePrefersReducedMotion();

  const [asked, setAsked] = useState({});        // travelerId → true
  const [bubble, setBubble] = useState({});      // travelerId → { text, mood }
  const [quarrel, setQuarrel] = useState(0);
  const [tries, setTries] = useState([]);        // 买过的水果 id
  const [armed, setArmed] = useState(false);     // 银币已拿起（点选模式）
  const [dragXY, setDragXY] = useState(null);    // 拖动中的银币位置（px，相对舞台）
  const [flying, setFlying] = useState(null);    // 正在递过去的水果 id
  const [step, setStep] = useState(0);           // 0 玩 · 1 买对了 · 2 后来
  const [vendor, setVendor] = useState(phase.vendorLine || t("摊主：「一枚银币，只够买一样。」"));
  const stage = useRef(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

  // 吵架：每人头上轮流冒自己的词
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (step !== 0) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), Math.max(500, 1300 - quarrel * 250));
    return () => clearInterval(id);
  }, [step, quarrel]);

  const ask = (tr) => {
    if (step !== 0) return;
    setBubble((b) => ({ ...b, [tr.id]: { text: tr.clue, mood: "talk", until: Date.now() + 4200 } }));
    if (!asked[tr.id]) {
      setAsked((a) => ({ ...a, [tr.id]: true }));
      if (onScore) onScore("clue:" + tr.id, POINTS.clue);
    }
  };

  const buy = (fruitId) => {
    if (step !== 0 || flying) return;
    setArmed(false); setDragXY(null);
    setFlying(fruitId);
    const nextTries = [...tries, fruitId];
    setTries(nextTries);
    later(() => {
      if (fruitId === phase.answer) {
        const b = {};
        travelers.forEach((tr) => { b[tr.id] = { text: `「${tr.word}！」`, mood: "happy", until: Infinity }; });
        setBubble(b);
        setVendor(t("摊主把一串葡萄掰成了四份。"));
        setStep(1);
        if (onScore) onScore("market", POINTS.market);
      } else {
        const b = {};
        travelers.forEach((tr) => { b[tr.id] = { text: `「这不是 ${tr.word}！」`, mood: "no", until: Date.now() + 2200 }; });
        setBubble(b);
        setQuarrel((q) => q + 1);
        setVendor(t("摊主翻了个白眼，把银币退给了你。"));
        later(() => setFlying(null), 900);
      }
    }, 750);
  };

  // —— 拖银币 ——
  const coinDown = (e) => {
    if (step !== 0 || flying) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = stage.current.getBoundingClientRect();
    setDragXY({ x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false });
  };
  const coinMove = (e) => {
    if (!dragXY) return;
    const r = stage.current.getBoundingClientRect();
    const moved = dragXY.moved || Math.hypot(e.clientX - dragXY.sx, e.clientY - dragXY.sy) > 8;
    setDragXY({ ...dragXY, x: e.clientX - r.left, y: e.clientY - r.top, moved });
  };
  const coinUp = (e) => {
    if (!dragXY) return;
    const wasMoved = dragXY.moved;
    setDragXY(null);
    if (!wasMoved) { setArmed((a) => !a); return; }       // 当作点选
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.dataset && x.dataset.fruit);
    if (el) buy(el.dataset.fruit);
  };

  const now = Date.now();
  const shake = reduced ? 0 : Math.min(3, quarrel + 1);
  const showHint = quarrel >= 2 && step === 0;
  const fruitById = Object.fromEntries(fruits.map((f) => [f.id, f]));

  return (
    <div style={kit.outer}>
      <div ref={stage} style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})`, touchAction: "none" }}
        onPointerMove={coinMove} onPointerUp={coinUp}>
        <div style={{ ...kit.dim, backgroundColor: "rgba(12,8,5,0.55)" }} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}

        <div style={cm.top}>
          {phase.situation && <div style={{ ...kit.situation, maxWidth: 820 }}>{nb(phase.situation)}</div>}
          <div style={cm.goalRow}>
            <span style={cm.goal}>{nb(phase.goal || t("一枚银币。让四个人都满意。"))}</span>
            <span style={cm.meter} aria-label={t("争吵程度")}>
              {t("争吵")}
              {[0, 1, 2, 3].map((i) => <i key={i} style={{ ...cm.pip, ...(i < quarrel ? cm.pipOn : null) }} />)}
            </span>
          </div>
        </div>

        {/* 四个人 */}
        <div style={cm.people}>
          {travelers.map((tr, i) => {
            const bb = bubble[tr.id];
            const live = bb && bb.until > now;
            const shouting = step === 0 && !live && (tick + i) % travelers.length < 2;
            const mood = live ? bb.mood : shouting ? "shout" : "idle";
            const text = live ? bb.text : shouting ? `「${tr.word}！」` : "";
            return (
              <div key={tr.id} style={cm.person}>
                <div style={{
                  ...cm.bubble,
                  ...(mood === "talk" ? cm.bubbleTalk : null),
                  ...(mood === "happy" ? cm.bubbleHappy : null),
                  opacity: text ? 1 : 0,
                  animation: mood === "shout" || mood === "no" ? `cmShake${shake} 0.35s ease-in-out infinite` : "none",
                }} aria-live="polite">
                  {text && (mood === "happy" ? <><Fruit kind="grape" size={22} /> {nb(text)}</> : nb(text))}
                </div>
                <button style={cm.avatar} onClick={() => ask(tr)} aria-label={`${tr.who}${t("：问问他要的是什么")}`}>
                  {tr.portrait ? (
                    // 有立绘就用立绘：这四个人要一眼看出是四拨人（波斯/阿拉伯/突厥/希腊），
                    // 代码画的色块做不到。正在喊的那个往前凑一点。
                    <img src={asset(tr.portrait)} alt="" style={{
                      ...cm.avatarImg,
                      transform: mood === "shout" || mood === "talk" ? "translateY(-2%) scale(1.04)" : "none",
                    }} />
                  ) : (
                    <Traveler hat={tr.hat} color={tr.color} mood={mood} />
                  )}
                </button>
                <div style={cm.name}>
                  {nb(tr.who)}{asked[tr.id] && <span style={cm.askedDot}>{" · " + t("问过")}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 果摊 */}
        <div style={cm.stall}>
          <div style={cm.vendor}>{nb(vendor)}</div>
          <div style={cm.fruits}>
            {fruits.map((f) => {
              const tried = tries.includes(f.id);
              return (
                <button key={f.id} data-fruit={f.id}
                  onClick={() => { if (armed) buy(f.id); else if (step === 0 && !flying) setVendor(t("摊主：「先把钱拿出来。」")); }}
                  style={{
                    ...cm.fruit,
                    ...(armed ? cm.fruitArmed : null),
                    opacity: flying === f.id ? 0.25 : 1,
                  }}>
                  <span data-fruit={f.id} style={{ pointerEvents: "none" }}><Fruit kind={f.kind} size={62} /></span>
                  <span data-fruit={f.id} style={cm.fruitName}>{nb(f.name)}{tried && step === 0 ? "　✗" : ""}</span>
                </button>
              );
            })}
          </div>
          {step === 0 && (
            <button style={{ ...cm.coin, ...(armed ? cm.coinArmed : null), visibility: dragXY && dragXY.moved ? "hidden" : "visible" }}
              onPointerDown={coinDown} aria-pressed={armed}
              onClick={(e) => { if (e.detail === 0) setArmed((a) => !a); }}
              aria-label={t("银币：拖到一样水果上买下它，或者点一下银币再点水果")}>
              <span style={cm.coinFace}>☾</span>
            </button>
          )}
          {step === 0 && (
            <div style={cm.coinHint}>{armed ? t("点一样水果买下它") : t("拖动银币到水果上 · 或点人问问")}</div>
          )}
        </div>

        {/* 递过去的水果 */}
        {flying && step === 0 && (
          <div style={{ ...cm.flyer, animation: reduced ? "none" : "cmFly 0.75s ease-out forwards" }}>
            <Fruit kind={fruitById[flying].kind} size={70} />
          </div>
        )}
        {dragXY && dragXY.moved && (
          <div style={{ ...cm.coin, ...cm.coinDrag, left: dragXY.x, top: dragXY.y }}><span style={cm.coinFace}>☾</span></div>
        )}

        {showHint && <div style={cm.hint}>{nb(phase.hint || t("……四个人喊的，会不会是同一样东西？"))}</div>}

        {step >= 1 && (
          <div style={cm.panel}>
            <div style={cm.converge}>
              {travelers.map((tr) => <span key={tr.id} style={cm.word}>{tr.word}</span>)}
              <span style={cm.arrow}>→</span>
              <Fruit kind="grape" size={40} />
            </div>
            <div style={kit.duo}>
              <div style={kit.card}>
                <div style={kit.cardLabel}>{t("你")}</div>
                <div style={kit.cardText}>
                  {nb(t("问了 {a} 个人，买了 {b} 次。").replace("{a}", String(Object.keys(asked).length)).replace("{b}", String(tries.length)))}
                </div>
              </div>
              <div style={{ ...kit.card, ...kit.cardHim }}>
                <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{t("其实")}</div>
                <div style={kit.cardText}>{t("一枚银币，一串葡萄，四个人都满意。")}</div>
              </div>
            </div>
            {phase.reveal && <div style={{ ...kit.reveal, fontSize: "clamp(13px, 1.1vw, 18px)" }}>{nb(phase.reveal)}</div>}
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

        <style>{`
          @keyframes cmShake1 { 0%,100% { transform: translateX(-50%) rotate(0) } 50% { transform: translateX(-50%) rotate(-2deg) } }
          @keyframes cmShake2 { 0%,100% { transform: translateX(-50%) rotate(-2deg) } 50% { transform: translateX(-50%) rotate(3deg) } }
          @keyframes cmShake3 { 0%,100% { transform: translateX(calc(-50% - 3px)) rotate(-4deg) } 50% { transform: translateX(calc(-50% + 3px)) rotate(4deg) } }
          @keyframes cmFly { from { transform: translate(-50%, 0) scale(0.8); opacity: 1 } to { transform: translate(-50%, -180%) scale(1.25); opacity: 1 } }
        `}</style>
      </div>
    </div>
  );
}

const cm = {
  top: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "max(3%, 48px) 8% 0", textAlign: "center",
  },
  goalRow: { display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  goal: { color: "#F5E6D3", fontSize: "clamp(15px, 1.3vw, 21px)", letterSpacing: 3, textShadow: "0 2px 10px rgba(0,0,0,0.9)" },
  meter: { display: "inline-flex", alignItems: "center", gap: 5, color: "#E2D3B4", fontSize: 12, letterSpacing: 3 },
  pip: { width: 12, height: 12, borderRadius: "50%", border: "1px solid rgba(226,211,180,0.6)", display: "inline-block" },
  pipOn: { backgroundColor: "#C8553D", borderColor: "#C8553D" },
  people: {
    position: "absolute", left: "6%", right: "6%", top: "25%", height: "36%", zIndex: 12,
    display: "flex", justifyContent: "space-around", alignItems: "flex-end",
  },
  person: { position: "relative", width: "18%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" },
  bubble: {
    position: "absolute", left: "50%", bottom: "74%", transform: "translateX(-50%)", zIndex: 3,
    minWidth: "100%", maxWidth: "170%", padding: "7px 12px", borderRadius: 12,
    backgroundColor: "rgba(252,248,238,0.95)", color: "#2B2118", border: "1px solid #C9A86A",
    fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.5, textAlign: "center", letterSpacing: 1,
    transition: "opacity 200ms ease", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  },
  bubbleTalk: { backgroundColor: "rgba(233,244,236,0.97)", borderColor: "#6E8B6A" },
  bubbleHappy: { backgroundColor: "rgba(246,236,214,0.98)", borderColor: "#B4762F", fontSize: "clamp(14px, 1.15vw, 19px)" },
  avatar: { width: "70%", height: "66%", padding: 0, border: "none", background: "none", cursor: "pointer" },
  avatarImg: {
    width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom",
    transformOrigin: "bottom center", transition: "transform 200ms ease",
    userSelect: "none", pointerEvents: "none",
  },
  name: { color: "#E9DCC2", fontSize: "clamp(12px, 0.9vw, 15px)", letterSpacing: 2, marginTop: 4, textShadow: "0 1px 6px rgba(0,0,0,0.9)" },
  askedDot: { color: "#9FC39A", fontSize: 12 },
  stall: {
    position: "absolute", left: "12%", right: "12%", bottom: "5%", height: "25%", zIndex: 14,
    borderRadius: 12, padding: "10px 16px",
    background: "linear-gradient(#6B4A2E, #4E3420)", border: "2px solid #8C6A45",
    boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  },
  vendor: { color: "#F3E3C0", fontSize: "clamp(12px, 0.94vw, 15.5px)", letterSpacing: 1 },
  fruits: { display: "flex", gap: "3%", justifyContent: "center", width: "74%" },
  fruit: {
    flex: "1 1 0", maxWidth: 150, minHeight: 44, padding: "6px 4px", borderRadius: 10,
    backgroundColor: "rgba(252,248,238,0.12)", border: "1px dashed rgba(243,227,192,0.35)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer",
    transition: "background-color 160ms ease, opacity 300ms ease",
  },
  fruitArmed: { backgroundColor: "rgba(252,248,238,0.26)", borderColor: "#E9C46A", borderStyle: "solid" },
  fruitName: { color: "#F3E3C0", fontSize: "clamp(12px, 0.9vw, 15px)", letterSpacing: 2 },
  coin: {
    position: "absolute", right: "4%", top: "50%", width: 58, height: 58, borderRadius: "50%",
    transform: "translate(0, -50%)",
    background: "radial-gradient(circle at 35% 30%, #F4F4F0, #B9BCC0 55%, #7E8286)",
    border: "2px solid #5E6266", boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", touchAction: "none",
  },
  coinArmed: { boxShadow: "0 0 0 4px rgba(233,196,106,0.7), 0 4px 12px rgba(0,0,0,0.5)" },
  coinDrag: { position: "absolute", right: "auto", transform: "translate(-50%, -50%)", zIndex: 30, pointerEvents: "none" },
  coinFace: { color: "#4A4E52", fontSize: 24, lineHeight: 1 },
  coinHint: { position: "absolute", right: "2%", bottom: 8, color: "#E2D3B4", fontSize: 12, letterSpacing: 1 },
  flyer: { position: "absolute", left: "50%", bottom: "20%", zIndex: 24, pointerEvents: "none" },
  hint: {
    position: "absolute", left: 0, right: 0, top: "18%", zIndex: 21, textAlign: "center", pointerEvents: "none",
    color: "#F0C987", fontSize: "clamp(14px, 1.15vw, 19px)", letterSpacing: 3, textShadow: "0 2px 10px rgba(0,0,0,0.95)",
  },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 26, maxHeight: "64%", overflowY: "auto",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    padding: "3% 8% 2.5%",
    background: "linear-gradient(to top, rgba(10,7,4,0.96) 0%, rgba(10,7,4,0.9) 78%, rgba(10,7,4,0) 100%)",
  },
  converge: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  word: {
    padding: "4px 12px", borderRadius: 14, border: "1px solid #C9A86A", color: "#F5E6D3",
    fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 1, fontStyle: "italic",
  },
  arrow: { color: "#D9BB7E", fontSize: 20 },
};
