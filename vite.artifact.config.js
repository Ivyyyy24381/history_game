// 单文件 artifact 构建（给 Claude Artifact / 发给别人直接点开试玩用）。
// 用法：npm run artifact:rumi   → dist-artifact/rumi_test.html
// 所有 JS/CSS/图片都内联，页面不依赖任何外部文件（Artifact 的 CSP 只放行 Google Fonts）。
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-artifact/_vite",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: "artifact/rumi.html",
      output: { inlineDynamicImports: true },
    },
  },
});
