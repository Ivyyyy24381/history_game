// 把鲁米交互原型打成一个自包含的 HTML 片段，可直接发布成 Claude Artifact / 发给别人双击打开。
//
//   npm run artifact:rumi        → dist-artifact/rumi_test.html
//
// 做三件事：
//   1. 用 vite.artifact.config.js 打包 artifact/rumi.html（JS/CSS 各一份）
//   2. 扫 src/data/rumi/events/*/event.json 里所有 "/assets/..." 路径，读 public/ 下的文件转成 data: URI，
//      以 window.__ASSET_MAP__ 注入（试玩页在把事件数据交给 ScenePlayer 前统一替换）
//   3. 把 JS/CSS 内联，去掉 html/head/body 外壳（Artifact 发布时会自己套骨架）
import { build } from "vite";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist-artifact");
const LINE = process.argv[2] || "rumi";

await build({ configFile: join(ROOT, "vite.artifact.config.js"), logLevel: "warn" });

const viteDir = join(OUT, "_vite");
const html = readFileSync(join(viteDir, "artifact", "rumi.html"), "utf8");
const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
const jsPath = pick(/<script[^>]*src="([^"]+)"/);
const cssPath = pick(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/);
const resolveOut = (p) => join(viteDir, "artifact", p);
const js = readFileSync(resolveOut(jsPath), "utf8");
const css = cssPath ? readFileSync(resolveOut(cssPath), "utf8") : "";

// —— 资产映射 ——
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
const evDir = join(ROOT, "src", "data", LINE, "events");
const paths = new Set();
for (const id of readdirSync(evDir)) {
  const f = join(evDir, id, "event.json");
  if (!existsSync(f)) continue;
  for (const m of readFileSync(f, "utf8").matchAll(/"(\/assets\/[^"]+)"/g)) paths.add(m[1]);
}
const map = {};
let bytes = 0;
for (const p of paths) {
  const file = join(ROOT, "public", p);
  if (!existsSync(file)) { console.warn("  ⚠ 缺图：" + p); continue; }
  const buf = readFileSync(file);
  bytes += buf.length;
  map[p] = `data:${MIME[extname(p).toLowerCase()] || "application/octet-stream"};base64,${buf.toString("base64")}`;
}

const safeJs = js.replace(/<\/script/gi, "<\\/script");
const page = `<title>鲁米交互原型</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&family=Noto+Serif+SC:wght@400;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>window.__ASSET_MAP__ = ${JSON.stringify(map)};</script>
<script type="module">${safeJs}</script>
`;
const outFile = join(OUT, `${LINE}_test.html`);
writeFileSync(outFile, page);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`✓ ${outFile.replace(ROOT + "/", "")}  ${kb(statSync(outFile).size)}（图片 ${paths.size} 张 ${kb(bytes)}）`);
