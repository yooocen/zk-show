/**
 * 预览生成脚本（仅开发用）：用真实 TopicSwitch 组件 + 真实 styles.css 渲染
 * preview-topic-switch.html，覆盖多档视图高度与选项数量，并在页面上直接打印几何指标，
 * 供肉眼核对「面板限高 + 滚动条常显 + 末尾选项可选」。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
const entry = join(__dirname, "..", ".preview-switch-tmp.ts");
const bundlePath = join(__dirname, "..", ".preview-switch-tmp.js");
const htmlOut = join(__dirname, "..", "preview-topic-switch.html");

const cases = [
  { pane: 900, count: 4 },
  { pane: 900, count: 20 },
  { pane: 300, count: 20 },
  { pane: 180, count: 20 },
];

writeFileSync(
  entry,
  `import { TopicSwitch } from "./src/topic-switch";

(globalThis as any).__mountSwitch = (host: HTMLElement, count: number): string => {
  const sw = new TopicSwitch();
  host.appendChild(sw.el);
  sw.setOptions(
    Array.from({ length: count }, (_, i) => ({
      code: String((i + 1) * (i % 3 === 2 ? 2 : 1)),
      title: "第 " + (i + 1) + " 号根话题标题（示例）",
    }))
  );
  sw.setSelected("1");
  const trigger = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!;
  trigger.click();
  const panel = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-panel")!;
  panel.scrollTop = panel.scrollHeight;
  const items = panel.querySelectorAll<HTMLElement>(".zk-show-topic-switch-item");
  const last = items[items.length - 1];
  const hostBottom = host.getBoundingClientRect().bottom;
  return [
    "视图高度=" + host.clientHeight + " 选项数=" + count,
    "面板 client=" + panel.clientHeight + " scroll=" + panel.scrollHeight + " maxHeight=" + panel.style.maxHeight,
    "面板 bottom=" + Math.round(panel.getBoundingClientRect().bottom) + " 视图 bottom=" + Math.round(hostBottom),
    "滚到底后最后一项可见=" + (last.getBoundingClientRect().bottom <= hostBottom),
    "滚动条占位=" + (panel.offsetWidth - panel.clientWidth) + "px",
    "宿主 touch-action=" + getComputedStyle(host).touchAction + " 面板 overscroll-behavior=" + getComputedStyle(panel).overscrollBehavior,
  ].join("\\n");
};
`,
  "utf8"
);

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: bundlePath,
  format: "iife",
  platform: "browser",
  target: "chrome110",
  logLevel: "warning",
});
const bundle = readFileSync(bundlePath, "utf8");

const sections = cases
  .map(
    ({ pane, count }) => `<section>
  <h2>视图高度 ${pane}px · 选项 ${count} 个</h2>
  <div class="zk-show-root" data-count="${count}" style="height:${pane}px;width:420px;border:1px solid #888"></div>
  <pre class="metrics"></pre>
</section>`
  )
  .join("\n");

writeFileSync(
  htmlOut,
  `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>zk-show 切换zk话题下拉预览</title>
<style>
:root {
  --background-primary: #fff;
  --background-secondary: #f2f3f5;
  --background-modifier-border: #d0d3d8;
  --background-modifier-border-hover: #b0b4ba;
  --background-modifier-accent: rgba(120, 120, 255, .18);
  --text-normal: #1e1e1e;
  --text-muted: #666;
  --text-faint: #999;
  --font-interface: -apple-system, "Segoe UI", sans-serif;
  --font-monospace: Consolas, monospace;
}
body { margin: 0; padding: 16px; font-family: var(--font-interface); }
h1 { font-size: 18px; }
h2 { font-size: 14px; margin: 18px 0 6px; }
pre.metrics { font: 12px var(--font-monospace); background: #fafafa; padding: 6px 8px; white-space: pre-wrap; }
</style>
<style>${styles}</style>
</head>
<body>
<h1>切换zk话题下拉：限高与滚动核对</h1>
${sections}
<script>${bundle}</script>
<script>
for (const host of document.querySelectorAll(".zk-show-root")) {
  host.parentElement.querySelector("pre.metrics").textContent = globalThis.__mountSwitch(host, Number(host.dataset.count));
}
</script>
</body>
</html>`,
  "utf8"
);

rmSync(entry, { force: true });
rmSync(bundlePath, { force: true });
console.log("已生成", htmlOut);
