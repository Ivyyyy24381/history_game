// 鲁米交互原型 · 试玩页（单文件 artifact）
// 目录页列出 src/data/rumi/events/* 的每一幕，点哪一幕就从哪一幕开始玩。
// 图片路径在构建时被换成 data: URI（见 scripts/build_artifact.mjs 注入的 window.__ASSET_MAP__）。
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import ScenePlayer from "../components/ScenePlayer";
import "../styles/game.css";

const MODULES = import.meta.glob("../data/rumi/events/*/event.json", { eager: true });
const EVENTS = Object.values(MODULES)
  .map((m) => m.default)
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const MAP = (typeof window !== "undefined" && window.__ASSET_MAP__) || {};
function remap(v) {
  if (typeof v === "string") return MAP[v] || v;
  if (Array.isArray(v)) return v.map(remap);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
  return v;
}

// 认知动词标记，和 docs/DESIGN_VERBS.md / lint 一致
const VERB = {
  predict_reveal: ["▲", "先判断"], scratch_reveal: ["▲", "先判断"],
  silence_choice: ["★", "改模型"], link_match: ["★", "改模型"],
  dark_explore: ["◆", "辨证据"],
};
const NAMES = {
  books_in_pool: "书落水池 · 先猜",
  what_do_you_know: "「你自己知道些什么？」· 沉默作答",
  four_and_grapes: "四人争葡萄 · 连线对照",
  dark_house: "黑屋里的东西 · 烛光摸索",
  painters: "中国画师与希腊画师 · 磨墙拉帘",
};

function Menu({ onPlay, score }) {
  return (
    <div className="rt-shell">
    <main className="rt-menu">
      <header className="rt-head">
        <p className="rt-eyebrow">历史长河 · 鲁米线</p>
        <h1>交互原型试玩</h1>
        <p className="rt-lede">
          五幕新交互，全部是「先自己判断，再和实际并排对照」。点任意一幕直接开始；
          玩完一个事件会回到这里。图片都是占位图，正式的细密画还没画。
        </p>
        {score > 0 && <p className="rt-score">本次试玩得分 <b>{score}</b></p>}
      </header>
      <div className="rt-events">
        {EVENTS.map((ev) => (
          <section key={ev.id} className="rt-event">
            <div className="rt-event-top">
              <span className="rt-year">{ev.year}</span>
              <h2>{ev.title}</h2>
              <button className="rt-play" onClick={() => onPlay(ev, 0)}>从头玩</button>
            </div>
            <ol className="rt-phases">
              {ev.phases.map((p, i) => {
                const [glyph, verb] = VERB[p.type] || ["·", p.type];
                return (
                  <li key={p.id}>
                    <button className="rt-phase" onClick={() => onPlay(ev, i)}>
                      <span className="rt-glyph" title={verb} aria-hidden="true">{glyph}</span>
                      <span className="rt-pname">{NAMES[p.id] || p.id}</span>
                      <span className="rt-type">{p.type}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <footer className="rt-foot">
        ▲ 先判断　★ 改模型　◆ 辨证据 —— 分类见 docs/DESIGN_VERBS.md
      </footer>
    </main>
    </div>
  );
}

function App() {
  const [run, setRun] = useState(null); // { ev, start, key }
  const [score, setScore] = useState(0);
  const seen = React.useRef(new Set()); // 同一关只计一次分，和正式游戏一样按 key 去重
  const back = () => setRun(null);
  if (!run) {
    return <Menu score={score} onPlay={(ev, start) => setRun({ ev: remap(ev), start, key: Date.now() })} />;
  }
  return (
    <>
      <ScenePlayer
        key={run.key}
        sceneData={run.ev}
        eventId={run.ev.id}
        startPhase={run.start}
        awardScore={(k, pts) => {
          if (seen.current.has(k)) return;
          seen.current.add(k);
          setScore((s) => s + (Number(pts) || 0));
        }}
        onComplete={back}
      />
      <button className="rt-back" onClick={back}>目录</button>
    </>
  );
}

const css = `
:root {
  --vh100: 100vh;
  --font-body: 'LXGW WenKai TC', 'Noto Serif SC', 'Kaiti SC', 'STKaiti', 'KaiTi', serif;
  --ink: #12161F; --panel: #1B2130; --line: #33415C; --text: #EFE6D2; --muted: #B7AC95;
  --ochre: #D19A4E; --lapis: #6F8FC9;
  color-scheme: dark;
}
@supports (height: 100dvh) { :root { --vh100: 100dvh; } }
html, body { background: var(--ink) !important; color: var(--text); margin: 0; }
.rt-shell { background: var(--ink); color: var(--text); min-height: var(--vh100); padding-inline: 16px; }
.rt-head h1, .rt-event h2 { color: var(--text); }
body { font-family: var(--font-body); }
.rt-menu { max-width: 860px; margin: 0 auto; padding-block: 40px 56px; display: grid; gap: 28px; }
.rt-eyebrow { margin: 0; color: var(--ochre); letter-spacing: .3em; font-size: 13px; }
.rt-head h1 { margin: 6px 0 10px; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: .08em; text-wrap: balance; }
.rt-lede { margin: 0; color: var(--muted); line-height: 1.85; max-width: 62ch; font-size: 16px; }
.rt-score { margin: 12px 0 0; color: var(--muted); font-variant-numeric: tabular-nums; }
.rt-score b { color: var(--ochre); }
.rt-events { display: grid; gap: 18px; }
.rt-event { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 18px 12px; }
.rt-event-top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.rt-year { color: var(--ochre); font-variant-numeric: tabular-nums; letter-spacing: .1em; font-size: 15px; }
.rt-event h2 { margin: 0; font-size: 21px; letter-spacing: .06em; flex: 1 1 auto; }
.rt-play { font: inherit; font-size: 14px; color: var(--ink); background: var(--ochre); border: 0; border-radius: 18px;
  padding: 7px 16px; cursor: pointer; min-height: 36px; }
.rt-phases { list-style: none; margin: 12px 0 0; padding: 0; display: grid; }
.rt-phase { width: 100%; display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 10px;
  font: inherit; text-align: left; color: var(--text); background: transparent; border: 0;
  border-top: 1px solid rgba(111,143,201,.18); padding: 12px 4px; cursor: pointer; min-height: 44px; }
.rt-phase:hover { background: rgba(111,143,201,.08); }
.rt-glyph { color: var(--lapis); font-size: 16px; text-align: center; }
.rt-pname { font-size: 16px; letter-spacing: .04em; }
.rt-type { color: var(--muted); font-size: 12px; font-family: ui-monospace, Menlo, monospace; }
.rt-foot { color: var(--muted); font-size: 13px; letter-spacing: .05em; }
.rt-back { position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); right: 14px; z-index: 1000;
  font: inherit; font-size: 13px; letter-spacing: .2em; color: var(--text); background: rgba(18,22,31,.78);
  border: 1px solid var(--line); border-radius: 16px; padding: 6px 14px; cursor: pointer; min-height: 32px; }
button:focus-visible { outline: 2px solid var(--ochre); outline-offset: 2px; }
@media (max-width: 480px) { .rt-type { display: none; } .rt-phase { grid-template-columns: 22px 1fr; } }
`;
const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
