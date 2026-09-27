// 把一份内容 JSON 翻成当前语言。
//
// 关键决定：**一个数据文件都不动。** 翻译只发生在读取的那一刻——
// 深拷贝一份，逐个字符串按 JSON 路径去字典里查；查不到就留中文。
// 所以 ScenePlayer 那 5900 行渲染代码一行都不用改，
// 也不会有「译文只译了一半、渲染路径漏了一处」这种事。
//
// key = JSON 路径，前缀跟 scripts/i18n_extract.mjs 里的必须一致：
//   events/<eventId>/…  quiz/<eventId>/…  cast/…  timeline/…

import { getLang } from "./lang";

// 字典很小（一条线一门语言一个文件），eager 打包省掉一层异步；
// castFor() 是同步函数，拿不到 Promise。将来字典大了再改懒加载。
const DICTS = import.meta.glob("../data/*/i18n/*.json", { eager: true });

// 只有作者注释不译。填空题的 answer / blanks / distractors 是**一起译**的：
// 它们是同一组字符串，整组换语言就还对得上。译漏了半组会被
// scripts/i18n_extract.mjs 的 checkFillIntegrity 拦下来；万一还是漏进来了，
// 下面 guardFill() 会把那一道题整个退回中文，宁可一道题不换语言，也不能出死题。
const DENY = new Set(["_note"]);

// 兜底：answer 找不到对应词库项时，把这道题的 answer/blanks/distractors 退回原文。
function guardFill(out, src) {
  // 只管 poem_compose 这种「答案必须是 blanks 里的一项」的形状。
  // exam 的 poem_fill 是 [answer, ...distractors]，答案天然在池子里，不会坏。
  if (typeof out.answer !== "string" || !Array.isArray(out.blanks) || !out.blanks.length) return;
  if (out.blanks.includes(out.answer)) return;
  out.answer = src.answer;
  if (src.blanks) out.blanks = src.blanks;
  if (src.distractors) out.distractors = src.distractors;
}

function dictFor(line, lang) {
  if (!line || lang === "zh") return null;
  // en.template.json / en.skipped.json 是给翻译用的中间产物，不能当字典
  const mod = DICTS[`../data/${line}/i18n/${lang}.json`];
  return (mod && (mod.default || mod)) || null;
}

function walk(node, path, dict, key) {
  if (typeof node === "string") {
    if (DENY.has(key)) return node;
    const hit = dict[path];
    return typeof hit === "string" && hit ? hit : node;
  }
  if (Array.isArray(node)) return node.map((v, i) => walk(v, `${path}/${i}`, dict, key));
  if (node && typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node)) out[k] = walk(node[k], `${path}/${k}`, dict, k);
    guardFill(out, node);
    return out;
  }
  return node;
}

/**
 * @param {any}    data    原始 JSON（不会被改动）
 * @param {string} line    "dante" / "dufu"
 * @param {string} prefix  key 前缀，如 "events/1302_esilio"
 * @returns 翻好的副本；无字典时原样返回同一个对象（不拷贝）
 */
export function localize(data, line, prefix, lang = getLang()) {
  const dict = dictFor(line, lang);
  if (!dict || !data) return data;
  return walk(data, prefix, dict);
}

/** 事件 id 的年份 <1000 → 杜甫线，否则但丁线。全站已有的判定，收在这里一处。 */
// 当前故事线（选人时由 App 设一次）。
// 原来只按「事件 id 的年份 <1000 → 杜甫，否则但丁」猜：但丁 1265–1321 和鲁米
// 1219–1273 年份重叠，光看年份永远分不开；EventPanel/QuizPanel 还拿 stage.id
// （"exile" 这种）来调，parseInt 是 NaN。改成显式设定，年份规则只作兜底。
let CURRENT_LINE = null;

/** 选人 / 载入 timeline 时调一次，参数是 characters.js 的 dataDir。 */
export function setLine(dir) {
  CURRENT_LINE = dir || null;
}

/** 当前故事线；没设定时退回旧的年份猜法。 */
export const lineOf = (eventId) =>
  CURRENT_LINE || (parseInt(eventId, 10) < 1000 ? "dufu" : "dante");
