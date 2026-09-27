#!/usr/bin/env node
// phase 编排 lint —— 防止这个游戏退化成「点一下、读一段」的电子课本。
//
// 设计原则（docs/DESIGN_VERBS.md）：
//   每一个 interaction 都应该把一个认知动作外化：
//   预测 / 观察 / 归类 / 连接 / 解释 / 修正 / 重建。
//
// 硬规则（不过就 exit 1）：
//   H1  不允许连续 3 个纯读屏 phase
//   H2  一个事件不允许「只有读屏 + 点人读字」——至少要有一个需要玩家先产出判断的 phase
//
// 认知动作八类里，generate/evidence/revise/synth/sequence 计入占比；
// bridge（过桥）和 dexterity（手速）不计——它们好看，但不教东西。
//
// 软规则（只警告，是待办清单不是错误）：
//   S1  每个事件应含 generation（先给出判断）
//   S2  每个事件应含 evidence（在材料里做区分）
//   S3  每个事件应含 revision（拿玩家的答案和史实/文本对照）
//   S4  不建议连续 2 个纯读屏
//
// 用法：npm run lint:phases          全线记分板
//       npm run lint:phases -- dante  只看一条线

import fs from "fs";
import path from "path";

const DATA = "src/data";

// —— phase 按「玩家实际做的认知动作」分类，不是按 UI 形态 ——
const PASSIVE = new Set(["transition", "narration", "comic_reveal"]);          // 点一下，读一段
const BROWSE  = new Set(["explore", "map_travel"]);                            // 找一找，读一段
const GENERATE = new Set(["predict_reveal", "poem_compose", "explain_by_building",
                          "contrapasso", "forced_choice", "flee_florence", "petition",
                          "scratch_reveal", "pool_rescue", "bird_flight"]);                    // 先产出一个判断
const EVIDENCE = new Set(["evidence_select", "click_points", "exam", "dark_explore", "eavesdrop"]);         // 在材料里做区分
const REVISE   = new Set(["inferno_placement", "comedy_encounter", "commit_then_reveal",
                          "prophecy_paradox", "silence_choice", "link_match",
                          "coin_market"]);                                // 拿自己的答案去对照
// 注：contrapasso(build) 和 explain_by_building 提交后也做「你 / 但丁」并列对照，
// 但它们的主动作是「先造出一个东西」，所以归 generate，不重复计入 revise。
const DEXTERITY = new Set(["sliding_puzzle", "escape_game", "minigame", "dialogue_branch"]); // 手速/包装
// 过桥：要玩家动手，但不要求判断（仪式性转场）。不计入认知动作占比——
// 它好看，但它不教东西，别让它把分数刷上去。
const BRIDGE = new Set(["echo_portal"]);
// 连接/综合：把散落的东西装成一个系统。天堂那一关的语法——
// 地狱是归类（你是什么），炼狱是变化（你能怎么改），天堂是连接（万物怎么接起来）。
const SYNTH = new Set(["celestial_spheres", "trust_game"]);
// 顺序与变化：什么先，什么后？——炼狱的动词。
// 三界的语法本来缺这一块：地狱是归类（你是什么），天堂是连接（万物怎么接起来），
// 炼狱一直空着。comic_sort 干的正是排顺序，登记在这里。
const SEQUENCE = new Set(["comic_sort"]);

const CAT = (t) =>
  PASSIVE.has(t) ? "passive" : BROWSE.has(t) ? "browse" : GENERATE.has(t) ? "generate"
  : EVIDENCE.has(t) ? "evidence" : REVISE.has(t) ? "revise" : SYNTH.has(t) ? "synth"
  : SEQUENCE.has(t) ? "sequence" : BRIDGE.has(t) ? "bridge"
  : DEXTERITY.has(t) ? "dexterity" : "unknown";

const lines = fs.existsSync(DATA)
  ? fs.readdirSync(DATA).filter((d) => fs.statSync(path.join(DATA, d)).isDirectory())
  : [];
const only = process.argv[2];
const targets = only ? lines.filter((l) => l === only) : lines;

let hard = 0, soft = 0;
const bar = (n, total, w = 22) => {
  const k = total ? Math.round((n / total) * w) : 0;
  return "█".repeat(k) + "·".repeat(w - k);
};

for (const line of targets) {
  const evDir = path.join(DATA, line, "events");
  if (!fs.existsSync(evDir)) continue;
  const events = fs.readdirSync(evDir).sort();
  const tally = {};
  let totalPhases = 0;

  console.log(`\n\x1b[1m${line}\x1b[0m`);
  console.log("─".repeat(72));

  for (const id of events) {
    const f = path.join(evDir, id, "event.json");
    if (!fs.existsSync(f)) continue;
    const phases = (JSON.parse(fs.readFileSync(f, "utf-8")).phases || []);
    const cats = phases.map((p) => CAT(p.type));
    phases.forEach((p) => { tally[CAT(p.type)] = (tally[CAT(p.type)] || 0) + 1; });
    totalPhases += phases.length;

    const has = (c) => cats.includes(c);
    const problems = [];

    // H1 / S4 连续读屏
    let runMax = 0, run = 0, runAt = 0;
    cats.forEach((c, i) => {
      if (c === "passive") { run++; if (run > runMax) { runMax = run; runAt = i - run + 1; } }
      else run = 0;
    });
    if (runMax >= 3) { problems.push(["H1", `连续 ${runMax} 个读屏 phase（第 ${runAt + 1} 幕起）`]); hard++; }
    else if (runMax === 2) { problems.push(["S4", "有连续 2 个读屏 phase"]); soft++; }

    // H2 全是读屏 + 浏览
    if (!has("generate") && !has("evidence") && !has("revise") && !has("synth") && !has("sequence")) {
      problems.push(["H2", "整关没有任何需要玩家先产出判断的 phase"]); hard++;
    } else {
      if (!has("generate")) { problems.push(["S1", "缺 generation（让玩家先给出判断）"]); soft++; }
      if (!has("evidence")) { problems.push(["S2", "缺 evidence（在材料里做区分）"]); soft++; }
      if (!has("revise"))   { problems.push(["S3", "缺 revision（拿玩家答案和史实对照）"]); soft++; }
    }

    const icon = problems.some(([k]) => k[0] === "H") ? "\x1b[31m✗\x1b[0m"
               : problems.length ? "\x1b[33m!\x1b[0m" : "\x1b[32m✓\x1b[0m";
    const mark = { passive: "·", browse: "○", generate: "▲", evidence: "◆", revise: "★", synth: "✧", sequence: "⇅", bridge: "◈", dexterity: "◇", unknown: "?" };
    console.log(`${icon} ${id.padEnd(18)} ${cats.map((c) => mark[c]).join("")}  (${phases.length})`);
    for (const [k, m] of problems) console.log(`    ${k}  ${m}`);
  }

  console.log("─".repeat(72));
  const order = ["passive", "browse", "generate", "evidence", "revise", "synth", "sequence", "bridge", "dexterity", "unknown"];
  const cn = { passive: "读屏", browse: "浏览", generate: "先判断", evidence: "辨证据", revise: "改模型", synth: "连成系统", sequence: "排顺序", bridge: "过桥", dexterity: "手速", unknown: "未知" };
  for (const c of order) {
    const n = tally[c] || 0;
    if (!n && c === "unknown") continue;
    const pct = totalPhases ? Math.round((n / totalPhases) * 100) : 0;
    console.log(`  ${cn[c].padEnd(4)} ${bar(n, totalPhases)} ${String(n).padStart(3)}  ${String(pct).padStart(3)}%`);
  }
  const cognitive = (tally.generate || 0) + (tally.evidence || 0) + (tally.revise || 0) + (tally.synth || 0) + (tally.sequence || 0);
  const pct = totalPhases ? Math.round((cognitive / totalPhases) * 100) : 0;
  console.log(`  \x1b[1m认知动作占比 ${pct}%\x1b[0m  （目标 ≥ 40%）`);
}

console.log(`\n图例  · 读屏  ○ 浏览  ▲ 先判断  ◆ 辨证据  ★ 改模型  ✧ 连成系统  ⇅ 排顺序  ◈ 过桥  ◇ 手速`);
console.log(`结果  硬规则失败 ${hard}   软规则待办 ${soft}`);
process.exit(hard > 0 ? 1 : 0);
