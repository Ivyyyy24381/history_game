// 新交互类型共用的小零件：纸色卡片、「你 / 实际」并列、按钮。
// 视觉照抄 ScenePlayer 里 PredictRevealPhase 的 prStyles，让新旧 phase 看起来是同一套。
// （ScenePlayer.jsx 已经 6500 行了，新 phase 各自一个文件，从 ScenePlayer 里分发。）

export const kit = {
  outer: {
    position: "fixed", inset: 0, zIndex: 200, backgroundColor: "#000",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--font-body)",
  },
  stage: {
    position: "relative",
    width: "min(100vw, calc(var(--vh100) * 16 / 9))",
    height: "min(var(--vh100), calc(100vw * 9 / 16))",
    aspectRatio: "16 / 9",
    backgroundSize: "cover", backgroundPosition: "center",
    backgroundColor: "#1B1712",
    overflow: "hidden",
  },
  dim: { position: "absolute", inset: 0, backgroundColor: "rgba(12,8,5,0.58)" },
  wrap: {
    position: "absolute", inset: 0, zIndex: 20,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "4% 9%", textAlign: "center", gap: 14, overflowY: "auto",
    background: "radial-gradient(ellipse 70% 78% at 50% 50%, rgba(10,7,4,0.82) 0%, rgba(10,7,4,0.62) 55%, rgba(10,7,4,0) 100%)",
  },
  situation: {
    color: "#E2D3B4", fontSize: "clamp(12.5px, 1.0vw, 16.5px)", lineHeight: 1.9, letterSpacing: 1,
    maxWidth: 760, textShadow: "0 2px 10px rgba(0,0,0,0.95)", whiteSpace: "pre-line",
  },
  question: {
    color: "#F5E6D3", fontSize: "clamp(16px, 1.46vw, 24px)", letterSpacing: 3, lineHeight: 1.6,
    textShadow: "0 2px 12px rgba(0,0,0,0.9)", maxWidth: 820,
  },
  opts: { display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 560 },
  opt: {
    minHeight: 44, padding: "12px 20px", borderRadius: 10,
    backgroundColor: "rgba(252,248,238,0.94)", color: "#3A2E20",
    border: "1px solid #C9A86A", cursor: "pointer", fontFamily: "var(--font-body)",
    fontSize: "clamp(13px, 1.11vw, 18.4px)", lineHeight: 1.7, letterSpacing: 1,
  },
  hint: { color: "rgba(245,230,211,0.9)", fontSize: "clamp(12px, 0.79vw, 13px)", letterSpacing: 2 },
  duo: { display: "flex", gap: 14, width: "100%", maxWidth: 720, justifyContent: "center", flexWrap: "wrap" },
  card: {
    flex: "1 1 260px", minWidth: 220, padding: "12px 16px",
    backgroundColor: "rgba(252,248,238,0.9)", border: "2px solid rgba(201,168,106,0.4)",
    borderRadius: 10, textAlign: "left",
  },
  cardHim: { borderColor: "#C9A86A", backgroundColor: "rgba(246,236,214,0.96)" },
  cardLabel: { fontSize: 12, color: "#6E5F45", letterSpacing: 4, marginBottom: 5 },
  cardText: { fontSize: "clamp(12.5px, 1.04vw, 17.2px)", color: "#2B2118", lineHeight: 1.7, whiteSpace: "pre-line" },
  note: { color: "#D9BB7E", fontSize: "clamp(12px, 0.94vw, 15.5px)", letterSpacing: 2, textShadow: "0 1px 8px rgba(0,0,0,0.9)" },
  reveal: {
    color: "#F5E6D3", fontSize: "clamp(13.5px, 1.25vw, 20.7px)", lineHeight: 2.0, letterSpacing: 2,
    maxWidth: 720, textShadow: "0 2px 12px rgba(0,0,0,0.9)", whiteSpace: "pre-line",
  },
  consequence: {
    color: "#D8C8A8", fontSize: "clamp(12px, 0.97vw, 16px)", lineHeight: 1.9, maxWidth: 720,
    borderTop: "1px solid rgba(201,168,106,0.3)", paddingTop: 12,
    textShadow: "0 2px 10px rgba(0,0,0,0.9)", whiteSpace: "pre-line",
  },
  go: {
    minHeight: 44, alignSelf: "center", padding: "10px 26px", borderRadius: 22, border: "1px solid #C9A86A",
    backgroundColor: "rgba(252,248,238,0.92)", color: "#3A2E20", cursor: "pointer",
    fontFamily: "var(--font-body)", fontSize: "clamp(12px, 1.04vw, 17.2px)", letterSpacing: 2, marginTop: 4,
  },
  // 传说 / 改写 标签：教育向——玩家要分得清哪些是史料、哪些是后世传说
  legend: {
    position: "absolute", top: 14, left: 16, zIndex: 30,
    padding: "4px 12px", borderRadius: 14, fontSize: 12, letterSpacing: 2,
    color: "#2B2118", backgroundColor: "rgba(217,187,126,0.95)",
  },
};
