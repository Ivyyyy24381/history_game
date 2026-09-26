# 美工生成指南 · ASSET_PROMPTS_RUMI

> 鲁米线资产 prompt 清单，体例同 `ASSET_PROMPTS_DANTE.md`。剧本见 `SCREENPLAY_RUMI.md`——每条 prompt 都来自剧本里「背景」那一行。
> 机器可读版：[`scripts/assets_manifest_rumi.csv`](../scripts/assets_manifest_rumi.csv)（78 行）。
>
> **统计**：主角立绘 16 张 · NPC 立绘 18 张 · 背景 29 张 · 地图 5 张 · 道具 10 件 = **共 78 张** + BGM 4 首。
> 主页三图（`home/hp_*_rumi`）已经有了，不在本清单里。

## 怎么跑

```bash
# 0. 先测脸（本线最大风险：同一个人从 12 岁画到 66 岁）
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --only rumi --filter scholar/teaching
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --only rumi --filter child/standing

# 1. 脸和画风定了 → 主角全组（用 scholar/teaching 那张当 IPAdapter face reference）
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --only rumi --skip-existing

# 2. 先跑两个原型事件要替换的图，马上能在试玩页里看到效果
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --filter 1258_masnavi
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --filter 1244_shams

# 3. 其余全量
python scripts/run_comfyui_batch.py --manifest scripts/assets_manifest_rumi.csv --preset rumi --skip-existing
```

出图后：立绘抠图 `python scripts/remove_bg.py` → 转 webp（沿用现有流程）→ 事件 JSON 里的路径改成 `.webp` → `npm run artifact:rumi` 重新打试玩页。

## 通用风格指南（`--preset rumi` 自动追加，手动出图时粘在每条 prompt 后面）

**统一画风：波斯细密画（伊儿汗 → 帖木儿抄本插画）。**
和杜甫线「唐代工笔重彩」、但丁线「乔托湿壁画 × 泥金抄本」同一个逻辑：用人物自己那个世界的画风画他的一生。
鲁米同时代（13 世纪）的波斯绘画存世很少，最接近的是 14 世纪初伊儿汗朝的抄本插画（《史集》《大蒙古列王纪》），
再往后是 15 世纪帖木儿朝的成熟细密画——取二者之间：平面多视点、细线、矿物色平涂、金箔。

**画风（中文）**

```
波斯细密画风格，伊儿汗与帖木儿时期抄本插画，平面构图多视点，细线勾勒，矿物颜料平涂，
青金石蓝、绿松石、朱红、赭石、金箔主色，13世纪呼罗珊与安纳托利亚服饰建筑器物考证，
半写实，典雅宁静，无可读文字，无文字水印，无现代元素
```

**画风（英文，适合 MJ / SDXL）**

```
Persian miniature painting, Ilkhanid and Timurid manuscript illustration, flat multi-viewpoint
composition, fine outlines, flat mineral pigments, lapis lazuli, turquoise, vermilion, ochre and
gold-leaf palette, historically accurate 13th-century Khorasan and Anatolian costume and
architecture, semi-realistic, serene and elegant, no readable text, no watermark, no modern elements
```

**反面 prompt**

```
text, watermark, signature, modern, anachronism, chibi, anime style, harsh contrast, oversaturation,
blurry, low quality, deformed, extra fingers, Chinese elements, hanfu, Tang Dynasty style,
Italian fresco, Gothic architecture, European medieval, Arabic text, readable calligraphy,
Ottoman 16th century costume, fez
```

⚠️ 现在的 ComfyUI 工作流是 Turbo/schnell 单编码器，**negative 会被整个忽略**（脚本启动时会提示）。
所以「不要文字」「不要现代元素」都写在 positive 里了；负面词只在换成 SDXL/MJ 时才起作用。

### 四条硬约束

1. **同一张脸，五十四年。** 每条主角 prompt 都内嵌了同一段面部锚点：

   ```
   椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神
   ```

   年龄只改前半句：12 岁无须 → 18 岁初生短髭 → 30 岁黑须及下颌 → 40 岁黑须及胸 → 60 岁以上花白长须。
   但丁线的教训照搬：**鼻子只提一次**（`straight nose`），多提一次模型就加权一次；辨识度靠整组特征 + face reference，
   单张不满意换 seed（`--seed 777 --filter <名字>`），别往 prompt 里加码。
2. **不画可读文字。** 模型写不出正确的波斯/阿拉伯文，会生成乱码字母——婚约、手稿、地图一律「纸面无文字 / 字迹为抽象线条」。
   地名由游戏 UI 叠加。
3. **宗教内容的分寸。** 不描绘先知；清真寺只画建筑，不画礼拜中的人；旋转那张（`masnavi/whirling`）是庄重的冥想姿态，
   闭目、双臂微张，不要画成舞蹈的动感。
4. **服饰按 13 世纪。** 学者是大白头巾 + 长袍；**不要**后世梅夫拉维教团的高毡帽和 19 世纪土耳其的菲斯帽。
   沙姆斯是游方苦行者：黑毡帽、破旧黑羊毛斗篷。

### 输出规格

| 类别 | 规格 | 路径 |
|---|---|---|
| 主角立绘 | 768×1280 透明底 | `public/assets/rumi/hero/<分期>/<姿态>.png` |
| NPC 立绘 | 768×1280 透明底 | `public/assets/rumi/npcs/<id>.png` |
| 背景 | 1920×1080 | `public/assets/rumi/events/<事件>/backgrounds/`（框架书房在 `shared/backgrounds/`） |
| 地图 | 1920×1080 | `public/assets/rumi/maps/` |
| 道具 | 1024×1024 透明底 | `public/assets/rumi/props/` |

---

## 一、主角 · 分期立绘（16 张，type=`rumi`）

分期与默认姿态见 `SCREENPLAY_RUMI.md` 附录 A。

| 文件 | 用途 | Prompt（中，每条已含统一画风之外的全部要素） |
|---|---|---|
| `hero/portrait.png` | 选人头像 · 四十余岁 | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深靛蓝长袍外罩赭色披肩，半身像，微侧，一手持芦笛一手抚胸，庄重温和，选人头像构图 |
| `hero/child/standing.png` | 1219 · 12 岁旅装 | 13世纪波斯学者诗人鲁米，十二岁男孩，稚气未脱，无胡须，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，头戴小白布帽，土黄色旅行长袍束腰带，全身立绘，含双脚，露出鞋履，站立，手握一卷书，好奇地望向远方 |
| `hero/child/listening.png` | 1220 · 听阿塔尔讲故事 | 13世纪波斯学者诗人鲁米，十二岁男孩，稚气未脱，无胡须，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，头戴小白布帽，土黄色长袍，全身立绘，含双脚，露出鞋履，盘腿坐在地毯上，双手抱膝，仰头专注听故事 |
| `hero/youth/traveling.png` | 1221–1225 · 西行 | 13世纪波斯学者诗人鲁米，十八岁青年，面容清瘦，唇上初生短髭，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，头缠小白头巾，风尘仆仆的深褐旅行长袍与斗篷，全身立绘，含双脚，露出鞋履，拄木杖站立，疲惫而坚定 |
| `hero/youth/wedding.png` | 1225 · 婚礼 | 13世纪波斯学者诗人鲁米，十八岁青年，面容清瘦，唇上初生短髭，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，头缠白色头巾，绛红镶金边的婚礼长袍，全身立绘，含双脚，露出鞋履，站立，微微低头，羞涩而郑重 |
| `hero/scholar/teaching.png` | 1231 · 讲席（默认） | 13世纪波斯学者诗人鲁米，三十岁左右，黑色络腮胡修剪整齐及下颌，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深靛蓝学者长袍，全身立绘，含双脚，露出鞋履，站立讲经，右手抬起作讲解手势，左手托一本打开的书，自信从容 |
| `hero/scholar/reading.png` | 1233 · 游学 | 13世纪波斯学者诗人鲁米，三十岁左右，黑色络腮胡修剪整齐及下颌，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深靛蓝学者长袍，全身立绘，含双脚，露出鞋履，站立低头读一本厚书，眉头微蹙，沉浸 |
| `hero/scholar/retreat.png` | 1233 · 四十日闭关 | 13世纪波斯学者诗人鲁米，三十岁左右，黑色络腮胡修剪整齐及下颌，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，朴素灰白粗布长袍，全身立绘，含双脚，露出鞋履，在草席上盘腿闭目静坐，双手放在膝上，清瘦，极为安静 |
| `hero/scholar/on_mule.png` | 1244 · 骑骡过市（开场） | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深靛蓝学者长袍，骑在一头披挂织毯的灰色骡子上，侧身，神情矜持，全身立绘，含双脚，露出鞋履，骡子四蹄完整 |
| `hero/shams/stunned.png` | 1244 · 被问住（默认） | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深靛蓝学者长袍，全身立绘，含双脚，露出鞋履，站立，双手空垂，一本书掉在脚边，神情愕然失语 |
| `hero/shams/searching.png` | 1247 · 提灯寻人 | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深色旅行斗篷，全身立绘，含双脚，露出鞋履，夜里提一盏铜油灯向前探身寻找，神情焦急 |
| `hero/shams/grief.png` | 1247 · 失去 | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，深色长袍，全身立绘，含双脚，露出鞋履，站立，一手掩面，一手垂落，哀伤而克制 |
| `hero/masnavi/whirling.png` | 1250 · 旋转（庄重，非舞蹈） | 13世纪波斯学者诗人鲁米，四十岁上下，黑色络腮胡略长及胸，眼角初有细纹，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，白色宽大长袍外罩深色短披肩，全身立绘，含双脚，露出鞋履，缓缓旋转的姿态，双臂微张，右手掌心向上左手掌心向下，头微侧，闭目，庄重宁静，衣摆展开 |
| `hero/masnavi/dictating.png` | 1258 · 口述《玛斯纳维》（默认） | 13世纪波斯学者诗人鲁米，六十岁以上，花白长须及胸，面颊消瘦，眼神慈和，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，赭褐色朴素长袍，全身立绘，含双脚，露出鞋履，背靠软垫坐在地毯上，闭目口述，一手轻举 |
| `hero/old/sitting.png` | 1273 · 晚年 | 13世纪波斯学者诗人鲁米，六十岁以上，花白长须及胸，面颊消瘦，眼神慈和，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，赭褐色朴素长袍，全身立绘，含双脚，露出鞋履，端坐，双手合拢放在膝上，慈和微笑 |
| `hero/old/dying.png` | 1273 · 婚礼之夜 | 13世纪波斯学者诗人鲁米，六十岁以上，花白长须及胸，面颊消瘦，眼神慈和，头缠白色大头巾，椭圆长脸，额头宽高，浓黑弯眉，杏仁形深褐色眼睛，目光温和而专注，straight nose，薄唇，面容安静而有神，白色内袍，半卧在病榻软垫上，面容平静安详，一手握着另一人的手（只画出手），全身立绘，含双脚，露出鞋履 |

## 二、NPC 立绘（18 张，type=`npc`）

| 文件 | 用途 | Prompt（中，每条已含统一画风之外的全部要素） |
|---|---|---|
| `npcs/walad_old.png` | 框架讲述者 · 1291 | 13世纪末科尼亚学者苏丹·瓦拉德，六十五岁，白须，头缠白色头巾，深蓝长袍，手持芦苇笔和书稿，温厚沉静，全身立绘，含双脚，露出鞋履 |
| `npcs/baha_walad.png` | 父亲 · 1219–1231 | 13世纪呼罗珊宗教学者巴哈丁·瓦拉德，六十余岁，花白长须，大白头巾，深绿学者长袍，威严，手持念珠，全身立绘，含双脚，露出鞋履 |
| `npcs/mother_mumina.png` | 母亲 · 1219–1225 | 13世纪呼罗珊贵族妇人穆敏娜，四十余岁，素色头巾与长面纱只露面庞，深红长袍，温柔坚毅，全身立绘，含双脚，露出鞋履 |
| `npcs/caravan_leader.png` | 1219 撒马尔罕 | 13世纪中亚商队头领，五十岁，晒黑的脸，毡帽与皮背心，腰挂钱袋，精明老练，全身立绘，含双脚，露出鞋履 |
| `npcs/old_student.png` | 1219 撒马尔罕 | 13世纪呼罗珊经学院老学生，四十岁，白头巾，灰色长袍，怀抱书卷，谨慎低语，全身立绘，含双脚，露出鞋履 |
| `npcs/attar.png` | 1220 内沙布尔 | 12至13世纪波斯诗人阿塔尔，七十岁，雪白长须，药师围裙罩在长袍外，手托铜药碾，睿智慈祥，全身立绘，含双脚，露出鞋履 |
| `npcs/attar_apprentice.png` | 1220 内沙布尔 | 13世纪波斯药香铺学徒，十五岁少年，小帽，捧一只玫瑰水瓶，机灵，全身立绘，含双脚，露出鞋履 |
| `npcs/gowhar.png` | 妻子 · 1225 | 13世纪撒马尔罕少女高哈尔，十七岁，婚礼头纱与金色额饰，绛红长裙，羞涩浅笑，全身立绘，含双脚，露出鞋履 |
| `npcs/burhan.png` | 老师 · 1231–1233 | 13世纪呼罗珊苦修学者布尔汉丁，五十岁，瘦削，灰白胡须，旧羊毛斗篷，目光锐利，全身立绘，含双脚，露出鞋履 |
| `npcs/student_a.png` | 1231 · 1247 | 13世纪科尼亚经学院学生，二十岁，白色小头巾，蓝色长袍，捧书，敬佩的神情，全身立绘，含双脚，露出鞋履 |
| `npcs/student_b.png` | 1231 · 1247（嫉妒的学生） | 13世纪科尼亚经学院学生，二十五岁，白头巾，棕色长袍，抱臂斜视，怀疑而不满，全身立绘，含双脚，露出鞋履 |
| `npcs/shams.png` | 1244 · 1247 | 13世纪游方苦行者沙姆斯（大不里士的太阳），六十岁，黑色毡帽，破旧的黑色粗羊毛斗篷，灰黑胡须，眼神极锐利而带笑意，赤脚或破鞋，全身立绘，含双脚，露出鞋履 |
| `npcs/innkeeper.png` | 1244 糖商客栈 | 13世纪安纳托利亚商队客栈老板，五十岁，胖，头巾与围裙，手拿一大串钥匙，好奇八卦，全身立绘，含双脚，露出鞋履 |
| `npcs/sugar_merchant.png` | 1244 糖商客栈 | 13世纪波斯糖商，四十岁，彩色头巾，锦缎长袍，手托一块白色糖锭，热络，全身立绘，含双脚，露出鞋履 |
| `npcs/sultan_walad_young.png` | 1247 去大马士革请回沙姆斯 | 13世纪科尼亚青年苏丹·瓦拉德，二十一岁，短黑须，白头巾，旅行斗篷，忠厚认真，全身立绘，含双脚，露出鞋履 |
| `npcs/salah_goldsmith.png` | 1250 | 13世纪科尼亚金匠萨拉丁，五十岁，皮围裙，卷起的袖子，手上有茧，手握小锤，憨厚质朴，全身立绘，含双脚，露出鞋履 |
| `npcs/goldsmith_apprentice.png` | 1250 | 13世纪科尼亚金匠学徒，十四岁，皮围裙，脸上有炉灰，拉风箱，全身立绘，含双脚，露出鞋履 |
| `npcs/husam.png` | 1258 记录《玛斯纳维》 | 13世纪科尼亚弟子胡萨姆丁，三十三岁，修剪整齐的黑须，白头巾，浅色长袍，手持纸卷和芦苇笔，恭敬专注，全身立绘，含双脚，露出鞋履 |

## 三、背景（29 张，type=`bg`）

原型已经在用占位图的三张要优先出：`dark_house_elephant`（出图后在编辑器里重调四个热区坐标）、
`chinese_painters_wall`（替换借来的杜甫线泰山图）、`painters_hall`。

| 文件 | 用途 | Prompt（中，每条已含统一画风之外的全部要素） |
|---|---|---|
| `shared/backgrounds/walad_study_1291.png` | 框架 · 全线复用 | 1291年科尼亚书房夜景，一盏油灯，矮书桌上摊着书稿和芦苇笔，窗外夜色中隐约可见一座绿色穹顶墓的轮廓，温暖静谧（画面中不画人物） |
| `events/1219_balkh/backgrounds/samarkand_bazaar.png` | 1219 explore | 13世纪初撒马尔罕有顶市集，砖砌穹顶与拱廊，丝绸、瓜果、铜器摊位，远处城门外驼队走进来，清晨斜光，热闹 |
| `events/1219_balkh/backgrounds/balkh_house_packing.png` | 1219 flee_florence · room | 13世纪中亚学者之家内室，地毯上散放书卷、皮水囊、首饰盒与馕，窗外院子里跪着等待装货的骆驼，晨光 |
| `events/1219_balkh/backgrounds/caravan_gate_dawn.png` | 1219 flee_florence · gate | 13世纪撒马尔罕土黄色城门清晨，驼队排成一线出城，城墙上的旗帜，远方沙漠地平线泛白 |
| `events/1220_nishapur/backgrounds/nishapur_attar_shop.png` | 1220 explore | 13世纪内沙布尔药香铺内景，墙上一格格药材与香料罐，铜秤，玫瑰水瓶，午后光线穿过木格窗（不画店主） |
| `events/1220_nishapur/backgrounds/birds_seven_valleys.png` | 1220 predict_reveal | 细密画风格的七重山谷全景，一大群各色鸟排成长列飞越群山，最前面领路的是戴胜鸟，山谷一重比一重荒凉，最远处一面湖水平静如镜 |
| `events/1225_larende/backgrounds/larende_courtyard.png` | 1225 explore | 13世纪安纳托利亚小城的石砌院落，葡萄架，廊下挂着婚礼的彩色布幔，远处雪山与土黄色平原 |
| `events/1225_larende/backgrounds/marriage_contract_desk.png` | 1225 predict_reveal | 矮书桌特写，一张空白的婚约纸，芦苇笔、墨壶、撒沙罐，一支红烛，织毯为底（纸上无文字） |
| `events/1225_larende/backgrounds/comic_larende_year.png` | 1225 comic_reveal | 连环画长图横排4格，细密画风格金色边框分格：婚礼上的新人与乐师 / 母亲在廊下病倒 / 送葬队伍走出城门 / 年轻人独自站在墓前 |
| `events/1231_konya/backgrounds/konya_citadel_1228.png` | 1231 transition | 13世纪塞尔柱都城科尼亚远景，阿拉丁山丘上的清真寺与宫殿，城墙环绕，远处平原上的商队驿站，晴朗 |
| `events/1231_konya/backgrounds/konya_madrasa.png` | 1231 explore · 1247 复用 | 塞尔柱经学院方形内庭，四面尖拱廊，中央一方水池，墙面蓝绿色釉砖，廊下铺着坐垫（不画人物） |
| `events/1231_konya/backgrounds/seljuk_tile_wall.png` | 1231 tile_rotate | 塞尔柱清真寺墙面正面平视，蓝绿与黑色釉砖拼成的八角星与十角星几何图案，局部缺了几块砖 |
| `events/1233_syria/backgrounds/chilla_cell.png` | 1233 wait_resist | 石砌小斗室，一张草席，一盏油灯，高处一扇小窗透进一束光，木门紧闭，极简空寂 |
| `events/1244_shams/backgrounds/kosedag_aftermath.png` | 1244 transition | 1243年安纳托利亚高原战场余烬，塞尔柱旗帜倒在地上，远处山脊上蒙古骑兵队列，天色阴沉 |
| `events/1244_shams/backgrounds/sugar_merchants_inn.png` | 1244 explore | 13世纪科尼亚商队客栈内院，拱廊下堆着糖锭与香料货包，骆驼在水槽边饮水，一个角落里空着一张草席 |
| `events/1244_shams/backgrounds/pool_courtyard.png` | 1244 predict_reveal（书落水池） | 科尼亚宅院内的方形水池，池边石栏，几本书浮在水面上，池水映着天空，午后 |
| `events/1244_shams/backgrounds/shams_encounter_street.png` | 1244 silence_choice | 13世纪科尼亚街道，土黄色墙壁，远处宣礼塔，人群散开留出中间一片空地，傍晚金色斜光 |
| `events/1247_damascus/backgrounds/damascus_night_bazaar.png` | 1247 dark_explore · 整幅图 | 13世纪大马士革夜晚的有顶市集，长长的拱廊，关门的店铺，远处倭马亚清真寺宣礼塔剪影，地面积水映着微光，16:9 |
| `events/1250_goldsmith/backgrounds/goldsmith_street.png` | 1250 explore | 13世纪科尼亚集市的金匠街，一排敞开的小铺子，炉火、铁砧、金箔在阳光下发亮，行人三三两两 |
| `events/1250_goldsmith/backgrounds/goldsmith_forge.png` | 1250 rhythm | 金匠铺内景，炉火映红，铁砧上一片金箔，锤子悬在半空（不画人物），金色火星 |
| `events/1258_masnavi/backgrounds/baghdad_1258_smoke.png` | 1258 transition | 远方地平线上一座大城冒着滚滚黑烟，底格里斯河蜿蜒，近处逃难人群的剪影，黄昏 |
| `events/1258_masnavi/backgrounds/reed_bed_dawn.png` | 1258 poem_compose | 清晨的苇塘，一根芦苇被割下倒在水边，薄雾，远处一个人手拿芦笛走远的小小背影 |
| `events/1258_masnavi/backgrounds/grapes_market.png` | 1258 link_match（替换占位图） | 13世纪安纳托利亚路边果摊，一串串紫葡萄挂着，四个不同服饰的旅人（波斯、阿拉伯、突厥、希腊）争吵的远景，尘土路 |
| `events/1258_masnavi/backgrounds/dark_house_elephant.png` | 1258 dark_explore（替换占位图，热区坐标需重调） | 印度来的大象站在一间室内，侧身面朝左，象鼻垂地，大耳朵，背上披着红色镶金鞍毯，拱门与地砖，画面平光整幅可见（游戏里会用黑幕遮住），16:9 |
| `events/1258_masnavi/backgrounds/painters_hall.png` | 1258 scratch_reveal 背景 | 13世纪苏丹宫殿中相对的两间厅堂，中间垂着一道深红帘子，左边厅里墙上画满彩色壁画，右边厅里墙面光洁如镜 |
| `events/1258_masnavi/backgrounds/chinese_painters_wall.png` | 1258 scratch_reveal · 镜中画（替换泰山图） | 波斯细密画中描绘的中国画师作品：满墙的山水、花鸟与亭台，色彩浓丽，金色云纹，画面平视正面 |
| `events/1258_masnavi/backgrounds/dictation_room.png` | 1258 transition | 夜晚的书房，靠墙的软垫，矮桌上堆满写好的纸页和芦苇笔，油灯（不画人物） |
| `events/1273_wedding/backgrounds/konya_winter_1273.png` | 1273 transition | 冬日科尼亚，雪落在墓园与屋顶上，炊烟袅袅，灰蓝天空，安静 |
| `events/1273_wedding/backgrounds/comic_wedding_night.png` | 1273 comic_reveal | 连环画长图横排4格，细密画金色边框分格：病榻上的老人握着儿子的手 / 送葬队伍，不同服饰的人并肩而行 / 墓上建起绿色穹顶 / 白袍的旋舞者庄重旋转 |

## 四、地图（5 张，type=`bg`）

地图**不写地名文字**，城市图钉和地名由 GameMap 叠加；路线图留出图钉位置，别让山水挤在路线上。

| 文件 | 用途 | Prompt（中，每条已含统一画风之外的全部要素） |
|---|---|---|
| `maps/rumi_general_map.png` | 总图 | 手绘古地图风格的中亚到安纳托利亚全图，东起撒马尔罕、巴尔赫，西至科尼亚，南到麦加，标出里海、黑海、地中海、波斯湾与两河，山脉以细密画方式画出，留出城市图钉位置，羊皮纸底色（不写地名文字） |
| `maps/route_1219_khorasan.png` | 1219 | 手绘古地图风格路线图：撒马尔罕→布哈拉→梅尔夫→内沙布尔，驼队小图标沿虚线行进，沙漠色调（不写文字） |
| `maps/route_1221_hajj.png` | 1225 | 手绘古地图风格路线图：内沙布尔→巴格达→麦加→大马士革→马拉蒂亚→埃尔津詹→拉兰达，一条长长的弧线，沿途城市小图标（不写文字） |
| `maps/route_1233_syria.png` | 1233 | 手绘古地图风格路线图：科尼亚→托罗斯山口→阿勒颇→大马士革，山口用细密画山峦表示，春季色调（不写文字） |
| `maps/route_1247_damascus.png` | 1247 | 手绘古地图风格路线图：科尼亚→托罗斯山口→阿勒颇→大马士革，冬季色调，雪山（不写文字） |

## 五、道具（10 件，type=`prop`）

| 文件 | 用途 | Prompt（中，每条已含统一画风之外的全部要素） |
|---|---|---|
| `props/reed_flute_ney.png` | 1258 · 全线标志物 | 一支波斯芦笛ney，细长芦苇管，六个指孔，吹口处有牛角套 |
| `props/asrar_nama_book.png` | 1220 阿塔尔赠书 | 一本13世纪波斯手抄本，皮面封套带翻盖，封面压金几何花纹 |
| `props/marriage_contract.png` | 1225 | 一卷展开的空白婚约纸卷，边缘有金色花饰（纸面无文字） |
| `props/reed_pen_inkwell.png` | 1225 · 1258 | 一支削好的芦苇笔斜靠在黄铜墨壶旁 |
| `props/brass_oil_lamp.png` | 1247 提灯寻人 | 一盏黄铜油灯，带提环，灯芯燃着小火苗 |
| `props/goldsmith_hammer.png` | 1250 | 一把金匠小锤和一小片金箔 |
| `props/grape_bunch.png` | 1258 四人争葡萄 | 一串紫色葡萄连着枝叶 |
| `props/polished_mirror.png` | 1258 画师 | 一面圆形抛光金属镜，边框有塞尔柱花纹，镜面光亮 |
| `props/masnavi_pages.png` | 1258 · 1273 | 一叠写满的手稿纸页（字迹为抽象线条，不可读），用细绳捆着 |
| `props/shams_felt_cap.png` | 1247 线索物 | 一顶旧黑色毡帽 |

## 六、BGM（4 首，`public/assets/rumi/bgm/<stageId>.mp3`）

| stageId | 时期 | 风格一句话 |
|---|---|---|
| `exile` | 少年流亡 | 驼铃 + 都塔尔（两弦琴），慢而远，风声底噪 |
| `scholar` | 科尼亚学者 | 乌德琴独奏，端正、有条理，像在念书 |
| `shams` | 沙姆斯之火 | 手鼓（达夫）渐强 + 卡曼贾胡琴，焦灼、热烈，最后骤停 |
| `masnavi` | 芦笛之歌 | 芦笛（ney）独奏为主旋律，气息声清晰，宁静，结尾长音 |

全线主题乐器是**芦笛 ney**：它就是《玛斯纳维》第一句里那支「被人从苇塘割下、一直在哭」的芦笛。

## 生成顺序建议

1. 主角 `scholar/teaching` + `child/standing` 两张测脸、定画风
2. 主角全组（face reference）→ 沙姆斯、父亲、苏丹·瓦拉德（出场最多的三个 NPC）
3. 原型用的三张背景（`--filter 1258_masnavi`）→ 重打试玩页看效果
4. 其余背景 → 地图 → 道具 → 其余 NPC
5. 抠图 → 转 webp → 资产扫描确认 0 断链
