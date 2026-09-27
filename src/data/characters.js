// 历史长河 — 主人公花名册（单一事实来源）
//
// 主页、成就、数据加载都从这里读，新增人物只改这个文件：
//   1. 在 CHARACTERS 里加一项
//   2. 放好 public/assets/home/hp_{background,portrait,name}_<id> 三张图
//   3. 放好 src/data/<dataDir>/timeline.json（没有也不会崩，主页显示「建设中」）
//
// 字段说明：
//   id          唯一标识，同时用作 localStorage 成就 key、资源目录名
//   dataDir     src/data/<dataDir>/ 剧本目录，默认等于 id
//   background  主页背景（选中/悬停时淡入）
//   portrait    主页立绘 —— 已含该文明的窗框，窗内镂空透明，背景会透出来
//   name        名字书法/花体图；nameHeight 控制显示高度（各语种字形比例差别大）
//   heroPortrait 游戏内主角头像（沿用各故事线的 hero/portrait.webp）
//   completionLine 走完一生后的结语
//   scrimBoost  背景减淡系数 0–1：画面越密越需要（不填=0），保证标题/文字读得清
//   locked      true = 显示 🔒，不可进入
//   mapTheme    地图页的每线偏移（在 src/styles/theme.js 全局 token 之上做偏移，
//               不是另一套体系）：
//     ink         行迹实墨色（跟这张古地图自己的线稿一族）
//     inkFaint    未至路段/铅笔稿色
//     seal        印章朱砂色（已至印记、当前呼吸高亮）
//     pin         地图符号语汇："cinnabar" 朱砂圈点 / "tower" 红顶城塔
//     scrimBoost  地图底图减淡系数 0–1（同主页 scrimBoost 思路，密图才需要）

export const CHARACTERS = [
  {
    id: "dufu",
    dataDir: "dufu",
    name: "杜甫",
    latin: "Du Fu",
    title: "诗圣",
    years: "712—770",
    dynasty: "唐 · 中国",
    description: "以诗为史，走过盛唐的绚烂与崩塌",
    achievementTitle: "诗圣之路",
    completionLine: "从裘马轻狂的少年，到湘江舟中的诗圣。",
    recapEpigraph: "「李杜文章在，光焰万丈长。」——韩愈",
    heroPortrait: "/assets/dufu/hero/portrait.webp",
    avatar: "🖊",
    color: "#4A90A4",
    background: "/assets/home/hp_background_dufu.webp",
    scrimBoost: 0,
    portrait: "/assets/home/hp_portrait_dufu.webp",
    name_img: "/assets/home/hp_name_dufu.webp",
    nameHeight: 44,
    locked: false,
    // 青绿山水舆图：墨线 + 朱砂圈点
    mapTheme: {
      ink: "#3A2E20",
      inkFaint: "#7A6A50",
      seal: "#A63A2E",
      pin: "cinnabar",
      scrimBoost: 0.14,
    },
  },
  {
    id: "dante",
    dataDir: "dante",
    name: "但丁",
    latin: "Dante Alighieri",
    title: "至高诗人",
    years: "1265—1321",
    dynasty: "佛罗伦萨 · 意大利",
    description: "《神曲》作者，欧洲文艺复兴的先声，「意大利语之父」",
    achievementTitle: "Divina Commedia",
    completionLine: "从佛罗伦萨的婴儿，到拉文纳的桂冠诗人——是爱，推动太阳与群星。",
    recapEpigraph: "「是爱，在推动太阳和其他的星辰。」——《神曲·天堂》最后一行",
    heroPortrait: "/assets/dante/hero/portrait.webp",
    avatar: "📕",
    color: "#A63A2E",
    background: "/assets/home/hp_background_dante.webp",
    scrimBoost: 0.08,
    portrait: "/assets/home/hp_portrait_dante.webp",
    name_img: "/assets/home/hp_name_dante.webp",
    nameHeight: 26,
    locked: false,
    // 15 世纪泥金手抄本世界地图：深棕墨线 + 红顶城塔；画面密，底图略减淡
    mapTheme: {
      ink: "#3B2517",
      inkFaint: "#7A6A50",
      seal: "#A63A2E",
      pin: "tower",
      scrimBoost: 0.18,
    },
  },
  {
    id: "rumi",
    dataDir: "rumi",
    name: "鲁米",
    latin: "Jalāl al-Dīn Rūmī",
    title: "旋舞的诗人",
    years: "1207—1273",
    dynasty: "呼罗珊 · 科尼亚",
    description: "在旋舞与诗行之间追寻神圣之爱",
    achievementTitle: "旋舞之路",
    completionLine: "从逃难的孩子，到科尼亚的芦笛。",
    recapEpigraph: "「我曾是生的，后来熟了，最后燃尽了。」——传为鲁米的四行诗（本作试译）",
    heroPortrait: "/assets/rumi/hero/portrait.webp",
    avatar: "🌀",
    color: "#2F6F6B",
    background: "/assets/home/hp_background_rumi.webp",
    scrimBoost: 0.3,
    portrait: "/assets/home/hp_portrait_rumi.webp",
    name_img: "/assets/home/hp_name_rumi.webp",
    nameHeight: 34,
    locked: false,
    // 波斯细密画（占位，待鲁米线地图落地再调）：青金墨线 + 赭金印记
    mapTheme: {
      ink: "#33415C",
      inkFaint: "#7A6A50",
      seal: "#B4762F",
      pin: "cinnabar",
      scrimBoost: 0.2,
    },
  },
];

// 主页标题（篆书「歷史長河」）
export const TITLE_IMG = "/assets/home/hp_title.webp";

export const ACHIEVEMENT_TITLES = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c.achievementTitle])
);

// 走完一生后的结语；没写的人物由 App 兜底成通用句
export const RECAP_EPIGRAPHS = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c.recapEpigraph || ""])
);

export const COMPLETION_LINES = Object.fromEntries(
  CHARACTERS.filter((c) => c.completionLine).map((c) => [c.id, c.completionLine])
);

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) || null;

export default CHARACTERS;
