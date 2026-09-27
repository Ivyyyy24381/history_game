# 鲁米线 · 交接文档（给接手整条线的 Claude 会话）

> 2026-09-27。上一个会话做完了鲁米线的**交互原型**（8 幕）、剧本草案、素材策略。这份文档告诉你：
> 现在有什么、还缺什么、按什么顺序做、有哪些坑。**先把这份读完，再按「先读」列表读四份文档，然后再动代码。**

## 0. 一句话现状

鲁米线（`src/data/rumi/`）有 6 个事件目录、8 幕可玩的交互，全部用代码画的舞台和人物剪影 + 4 张真实古画。
还没有 `timeline.json`，主页上鲁米还是 `locked: true`，引擎里有几处「不是杜甫就是但丁」的写死判断。

## 1. 先读（按顺序）

1. `docs/DESIGN_VERBS.md` —— 全游戏的设计原则。重点读最后两节：「鲁米线新增」和「试玩反馈（2026-09-27）：手先动，字后读」。
2. `docs/ASSET_STRATEGY_RUMI.md` —— 素材策略：舞台代码画、讲故事用真实古画、只生成少量背景、**不生成人物**。
3. `docs/SCREENPLAY_RUMI.md` —— 10 个事件的剧本草案 + 「下一轮改造清单」+ 附录（cast、引文出处、同时代中国）。
4. `docs/CHARACTER_TEMPLATE.md` —— 新人物的通用工作流和接入 checklist。

## 2. 已经做好的

| 事件目录 | 幕（phase id · type） | 组件 |
|---|---|---|
| `1219_balkh` | `why_leave` · `eavesdrop` 贴墙偷听 | `src/components/phases/EavesdropPhase.jsx` |
| `1220_nishapur` | `seven_valleys` · `bird_flight` 七谷七种飞法 | `BirdFlightPhase.jsx` |
| `1244_shams` | `books_in_pool` · `pool_rescue` 只来得及救一本 | `PoolRescuePhase.jsx` |
| | `what_do_you_know` · `silence_choice` 静下来 | `SilenceChoicePhase.jsx` |
| `1258_masnavi` | `four_and_grapes` · `coin_market` 一枚银币 | `CoinMarketPhase.jsx` |
| | `dark_house` · `dark_explore` 黑屋里的大象 | `DarkExplorePhase.jsx` |
| | `painters` · `scratch_reveal` 中国画师与希腊画师 | `ScratchRevealPhase.jsx` |
| `1273_wedding` | `wedding_night` · `procession` 信物与送葬 | `ProcessionPhase.jsx` |

共用件：`phases/phaseKit.js`（纸色卡片样式）、`phases/figures.jsx`（人物剪影、水果、信物的 SVG）、`phases/ArtCard.jsx`（古画卡 + 墙签）、
`LinkMatchPhase.jsx`（通用连线件，目前没有事件在用）。所有类型都已在 `ScenePlayer.jsx` 分发、`SceneEditor.jsx` 下拉、`phaseTemplates.js` 模板、`scripts/lint_phases.mjs` 分类里登记。

古画：`public/assets/rumi/art/*.webp`（4 张，大都会博物馆公有领域），墙签在 `src/data/artworks.json`。

## 3. 怎么跑、怎么验

```bash
npm run dev                                   # 然后打开 ?shot=rumi/1258_masnavi/0 直达任意一幕（<line>/<eventId>/<phaseIndex>）
npm run artifact:rumi                         # 打成单文件试玩页 dist-artifact/rumi_test.html（可发布成 Claude Artifact）
npm run lint:phases -- rumi                   # 认知动作占比 / 硬规则
npm run i18n:ui                               # 组件里的 t("…") 是否都登记了（含 components/phases/）
npx vite build                                # 必须通过
```

每做完一件事：build + lint + 用 Playwright 把改动的那几幕**从头玩到尾**（包括「什么都不做」「全做错」这类边缘路径），再做一个小 commit。
上一个会话的经验：只在 `npm run dev` 下测会漏掉问题——开发页跑在 React StrictMode 下，单文件试玩页不是；百鸟会议的负 dt bug 就是只在试玩页出现的。**两边都要测。**

## 4. 接下来按这个顺序做

### 4.1 引擎通用化（先做，不然后面全踩坑）

- `ScenePlayer.jsx` 里 `parseInt(eventId, 10) < 1000 ? "dufu" : "dante"` 出现了好几次（`npcPortraitPath`、`heroPortraitPath` 等），
  `src/i18n/localize.js` 的 `lineOf()` 也是同一个判断——**鲁米的事件年份都 > 1000，会被当成但丁线**。
  改成按故事线目录判断（ScenePlayer 的调用方知道 line；`ShotHarness` 和 `App.jsx` 的 `dataDirOf(character)` 都有）。
- 鲁米**没有主角立绘**（策略：人物用剪影）。`heroPortraitPath` 对 rumi 要返回 null 或剪影，不能指向不存在的图；
  `characters.js` 里 `heroPortrait: null` 已经是这个意思，检查 CharacterRecap、DialogueBox 等所有读主角头像的地方能处理 null。
- 需要的话再写 `rumiPoses.js`（照 `dantePoses.js`）；按策略可以不写。

### 4.2 接素材（Ivy 已经在另一台电脑生成了一批）

- 放置位置和命名以 `scripts/assets_manifest_rumi_core.csv` 为准（7 张：6 张背景 + 1 张总图）。
  若生成的是 78 张全量清单（`assets_manifest_rumi.csv`）里的图，**只挑背景和地图用，人物立绘先不接**（见素材策略第二节）。
- 统一转 webp（长边 1920；参考 `scripts/prepare_rumi_art.py` 的做法），事件 JSON 里的路径写 `.webp`。
- 现在各幕的背景都是主页宫殿图占位（`/assets/home/hp_background_rumi.webp`），替换表见 `ASSET_STRATEGY_RUMI.md` 第三节。
- ⚠️ `1258 dark_explore` 的 `image` 如果换成新图，**四个热区坐标（spots 的 x/y/r）必须在编辑器（`?editor=true`）里重标**。
- 每换一张图，把那一幕在试玩页里玩一遍，看叠在上面的代码画（水池、墙、果摊、剪影）和背景协不协调。

### 4.3 把鲁米线接进主游戏

- 写 `src/data/rumi/timeline.json`：结构照 `src/data/dante/timeline.json`（`character` + `stages[].events[]`，每个事件有 `location.mapX/mapY`、`hasScene`、`hasQuiz`）。
  四个时期、事件列表和年份见 `SCREENPLAY_RUMI.md` 的「状态弧线」和「timeline.json · stages」。
- `src/data/characters.js`：鲁米 `locked: false`，补 `completionLine`、`recapEpigraph`（剧本里有建议文案），`mapTheme` 按总图调。
- 大地图坐标在 `TimelineEditor` 里拖着校准。

### 4.4 补齐剩下的事件（按剧本 + 改造清单）

还没做的：`1225_larende`、`1231_konya`、`1233_syria`、`1247_damascus`，以及已有事件里的过场与第 5 层
（1244 的克塞山过场与糖商客栈、1258 的芦笛之歌 poem_compose 与口授过场）。
**规则：每个事件的主操作必须是一个动作（拖、擦、举、停、买），不是点一个写满字的按钮。** 剧本里标「第二批」的新类型
（`trace` 书法描摹、`tile_rotate` 几何星、`wait_resist` 四十日、`rhythm` 金匠锤声）都有零代码替代方案，但 Ivy 明确更喜欢有动作的版本。
1247 的「提灯寻人」直接复用 `dark_explore`。

### 4.5 quiz.json

每个事件 3 题（2 选择 + 1 填空/排序），格式照 `src/data/dante/events/*/quiz.json`（`quizzes[]`，`type/question/options/answer/explanation`）。只考剧情里出现过的内容。

## 5. 硬规矩

- **史实 vs 传说要分开**：来自阿夫拉基《圣徒传》等后世传记的情节，挂 `legend` 标签（「传说 · …」）；对白是本作改写的要写明。
- **译文版权**：诗句只能用 Nicholson 英译（公有领域）为底本**自译**，标「本作试译 / 本作概述」；不能用 Coleman Barks 译本、国内现代中译本；
  不能用网上流传的「鲁米名言」（多为伪托）。1247 那句「我为什么要找他」**还没找到具体出处，上线前找不到就删**。
- **宗教分寸**：不描绘先知；旋转仪式要庄重，不做成跳舞小游戏。
- **不打 ✗**：玩家的答案留在屏幕上，和实际并排（commit → contrast）。
- **古画墙签只写在页面上核实过的字段**（`artworks.json` 的 `_note` 规矩）。
- 小步 commit；commit 信息写清为什么改。不要 push，除非 Ivy 说。

## 6. 已知的问题 / 待定

- 《明皇幸蜀图》绢色发暗，当镜中画不够亮；以后能访问维基共享资源时可以换王希孟《千里江山图》局部。
- 「鲁米与沙姆斯」的古画（奥斯曼时期阿夫拉基译本插图）授权没核实，暂缺。
- 《旋舞的托钵僧》是伊朗苏菲舞蹈，不是梅夫拉维旋转仪式——墙签照实写，别在文案里说成梅夫拉维。
- 试玩页现在约 3 MB（含 4 张古画）；背景图接进来后要注意单文件体积（Artifact 上限 16 MB）。
- `1258_masnavi` 的 `dark_explore` 目前用 `dark_house_placeholder.svg`（手画的大象），点灯后另有古画卡。

---

## 给新会话的开场 prompt（Ivy 直接复制这段）

```
这是「历史长河」的 repo（Chinese_history_game）。我们在做第三个人物鲁米。
上一个会话已经做好了 8 幕交互原型和剧本、素材策略，交接写在 docs/HANDOFF_RUMI.md。

请先完整读 docs/HANDOFF_RUMI.md，再按里面「先读」的顺序读那四份文档，然后：
1. 先做 4.1 引擎通用化（鲁米年份 > 1000 会被当成但丁线的问题）；
2. 再接我生成好的素材（放在 <素材所在的文件夹>，按 scripts/assets_manifest_rumi_core.csv 的路径和命名）；
3. 然后写 timeline.json、解锁鲁米，把现有 8 幕接进主游戏能从头玩；
4. 最后按剧本补剩下的事件。

规矩：每一步 vite build + lint + Playwright 实际玩一遍（dev 页和 npm run artifact:rumi 的试玩页都要测），
小步 commit，不要 push。每个小游戏的主操作要是一个动作，不要做成点文字按钮的选择题。
开始前先告诉我你的计划。
```
