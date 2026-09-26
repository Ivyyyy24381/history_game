// ============================================================
// SILENCE CHOICE — 唯一的正确答案是不作答（鲁米 · 1244 遇见沙姆斯）
// ============================================================
// 选项全是「书上说……」式的回答，每选一个，对方当场驳回；
// 你的回答和他的驳回并排留在屏幕上（不打 ✗，差额本身是教材）。
// 只要玩家 silenceSec 秒不再作答，沉默本身就成了回答。
// 这是全游戏第一次要求玩家「不按规则出牌」——对应鲁米从学者变成诗人的那个转折。
//
// phase: {
//   background, legend?, speaker?: { name, portrait },
//   situation, question,
//   options: [{ id, text, rebuttal }],
//   silenceSec = 10（开口之后）, firstSilenceSec = 30（开口之前）, exhaustedHint,
//   silenceReveal, consequence, youLabel, himLabel
// }
import { useEffect, useRef, useState } from "react";
import { nb } from "../../utils/cjkText";
import { t } from "../../i18n/ui";
import { asset } from "../../utils/asset";
import { POINTS } from "../../utils/scoring";
import usePrefersReducedMotion from "../../utils/usePrefersReducedMotion";
import { kit } from "./phaseKit";

export default function SilenceChoicePhase({ phase, onScore, onComplete }) {
  const options = phase.options || [];
  const silenceMs = Math.max(3, phase.silenceSec || 10) * 1000;
  // 还没开口之前给更长的时间——玩家可能还在读题，不能把「没读完」当成「选择了沉默」
  const firstSilenceMs = Math.max(silenceMs, (phase.firstSilenceSec || 30) * 1000);
  const [tried, setTried] = useState([]); // 按顺序记下玩家说过的
  const [silent, setSilent] = useState(false);
  const [step, setStep] = useState(0); // 0 问答 · 1 沉默之后 · 2 后来
  const reduced = usePrefersReducedMotion();
  const timer = useRef(null);
  const scored = useRef(false);
  const scoreRef = useRef(onScore);
  scoreRef.current = onScore; // 父组件重渲染会换掉 onScore；不能让它把空闲计时重置掉

  // 空闲计时：每次开口都重置。不显示倒计时——显示了就等于告诉玩家答案。
  useEffect(() => {
    if (silent) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSilent(true);
      setStep(1);
      if (!scored.current && scoreRef.current) { scored.current = true; scoreRef.current("silence", POINTS.silence); }
    }, tried.length === 0 ? firstSilenceMs : silenceMs);
    return () => clearTimeout(timer.current);
  }, [tried, silent, silenceMs, firstSilenceMs]);

  const speak = (id) => {
    if (silent || tried.includes(id)) return;
    setTried((xs) => [...xs, id]);
  };

  const exhausted = tried.length >= options.length;
  const byId = Object.fromEntries(options.map((o) => [o.id, o]));
  const speakerName = (phase.speaker && phase.speaker.name) || t("他");

  return (
    <div style={kit.outer}>
      <div style={{ ...kit.stage, backgroundImage: `url(${asset(phase.background)})` }}>
        <div style={kit.dim} />
        {phase.legend && <div style={kit.legend}>{nb(phase.legend)}</div>}
        {phase.speaker && phase.speaker.portrait && (
          <img src={asset(phase.speaker.portrait)} alt="" style={sc.portrait} />
        )}

        <div style={{ ...kit.wrap, justifyContent: "flex-start", paddingTop: "5%" }}>
          {phase.situation && step === 0 && tried.length === 0 && (
            <div style={kit.situation}>{nb(phase.situation)}</div>
          )}
          <div style={kit.question}>{nb(phase.question)}</div>

          {/* 说过的话留在原地，一问一驳并排 */}
          {tried.length > 0 && (
            <div style={sc.log} aria-live="polite">
              {tried.map((id) => (
                <div key={id} style={sc.exchange}>
                  <div style={sc.you}><span style={sc.who}>{t("你")}</span>{nb(byId[id].text)}</div>
                  <div style={sc.him}><span style={sc.who}>{nb(speakerName)}</span>{nb(byId[id].rebuttal)}</div>
                </div>
              ))}
            </div>
          )}

          {step === 0 && (
            <>
              <div style={kit.opts}>
                {options.filter((o) => !tried.includes(o.id)).map((o) => (
                  <button key={o.id} style={kit.opt} onClick={() => speak(o.id)}>{nb(o.text)}</button>
                ))}
              </div>
              {exhausted && (
                <div style={{ ...sc.waiting, animation: reduced ? "none" : "scBreath 3.2s ease-in-out infinite" }}>
                  {nb(phase.exhaustedHint || t("书里的答案都用完了。他还在等。"))}
                </div>
              )}
            </>
          )}

          {step >= 1 && (
            <>
              <div style={kit.duo}>
                <div style={kit.card}>
                  <div style={kit.cardLabel}>{phase.youLabel || t("你试过的回答")}</div>
                  <div style={kit.cardText}>
                    {tried.length === 0
                      ? t("一句也没有——你从一开始就没有开口。")
                      : nb(t("{n} 句，都是书上的话。").replace("{n}", String(tried.length)))}
                  </div>
                </div>
                <div style={{ ...kit.card, ...kit.cardHim }}>
                  <div style={{ ...kit.cardLabel, color: "#8A6A2E" }}>{phase.himLabel || t("他在等的")}</div>
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
            </>
          )}
        </div>
        <style>{`@keyframes scBreath { 0%,100% { opacity: .45 } 50% { opacity: 1 } }`}</style>
      </div>
    </div>
  );
}

const sc = {
  portrait: {
    position: "absolute", right: "3%", bottom: 0, height: "62%", zIndex: 10,
    objectFit: "contain", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.6))", pointerEvents: "none",
  },
  log: { display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 760 },
  exchange: { display: "flex", gap: 10, flexWrap: "wrap" },
  you: {
    flex: "1 1 280px", textAlign: "left", padding: "9px 14px", borderRadius: 8,
    backgroundColor: "rgba(226,216,196,0.9)", color: "#3A2E20",
    fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.7, textDecoration: "none",
  },
  him: {
    flex: "1 1 280px", textAlign: "left", padding: "9px 14px", borderRadius: 8,
    backgroundColor: "rgba(246,236,214,0.96)", color: "#2B2118", borderLeft: "3px solid #C9A86A",
    fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.7,
  },
  who: { display: "block", fontSize: 12, letterSpacing: 3, color: "#6E5F45", marginBottom: 2 },
  waiting: { color: "#E2D3B4", fontSize: "clamp(13px, 1.04vw, 17px)", letterSpacing: 4, marginTop: 8 },
};
