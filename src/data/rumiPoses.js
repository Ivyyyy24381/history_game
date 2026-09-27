// Rumi portrait poses, organized by life stage.
// Files live at /assets/rumi/hero/<stage>/<pose>.webp
// Resolution priority (in ScenePlayer):
//   dialogue line dufu_pose > phase dufu_pose > event dufu_pose > stage default by event year
// (键名沿用引擎现有的 dufu_pose / dufu_reaction，不改引擎。)
//
// 分期与默认姿态见 docs/SCREENPLAY_RUMI.md 附录 A。
// 立绘已转 webp（和杜甫、但丁两线一致）。

export const RUMI_POSES = [
  { value: "child/standing", label: "少年·旅装站立（12 岁）" },
  { value: "child/listening", label: "少年·盘腿听故事" },
  { value: "youth/traveling", label: "青年·风尘旅装" },
  { value: "youth/wedding", label: "青年·婚礼盛装" },
  { value: "scholar/teaching", label: "学者·讲经手势" },
  { value: "scholar/reading", label: "学者·执书低头" },
  { value: "scholar/retreat", label: "学者·闭关盘坐" },
  { value: "scholar/on_mule", label: "学者·骑骡过市" },
  { value: "shams/stunned", label: "沙姆斯·被问住" },
  { value: "shams/searching", label: "沙姆斯·提灯寻人" },
  { value: "shams/grief", label: "沙姆斯·掩面" },
  { value: "masnavi/whirling", label: "芦笛·旋转（庄重）" },
  { value: "masnavi/dictating", label: "芦笛·闭目口述" },
  { value: "old/sitting", label: "晚年·端坐" },
  { value: "old/dying", label: "晚年·病榻" },
];

// The character-select portrait. Any event reference to it is treated as
// "unset" and resolves to a stage default instead (same convention as dufu/dante).
export const RUMI_LEGACY_PORTRAIT = "/assets/rumi/hero/portrait.webp";

const STAGE_DEFAULT_POSE = {
  child: "child/standing",
  youth: "youth/traveling",
  scholar: "scholar/teaching",
  shams: "shams/stunned",
  masnavi: "masnavi/dictating",
};

// Life-stage boundaries (inclusive upper bound on event year).
export function rumiStageForYear(year) {
  if (!year) return null;
  if (year <= 1221) return "child";     // 1219 四十头骆驼 / 1220 内沙布尔
  if (year <= 1230) return "youth";     // 1225 拉兰达
  if (year <= 1243) return "scholar";   // 1231 讲席 / 1233 四十日
  if (year <= 1248) return "shams";     // 1244 沙姆斯 / 1247 大马士革
  return "masnavi";                     // 1250 金匠 / 1258 玛斯纳维 / 1273 婚礼之夜
}

// Resolve a Rumi portrait URL. `pose` like "shams/searching"; falls back to the
// stage default for `year`, then to the scholar look.
export function rumiPortraitPath(pose, year) {
  if (pose === RUMI_LEGACY_PORTRAIT) pose = null; // select-screen portrait → resolve
  if (!pose) {
    const stage = rumiStageForYear(year) || "scholar";
    pose = STAGE_DEFAULT_POSE[stage];
  }
  return `/assets/rumi/hero/${pose}.webp`;
}
