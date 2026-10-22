/**
 * 预览生成脚本（仅开发用）：用真实 ComboField 组件 + 真实 styles.css，在一个
 * 复刻 Obsidian 弹窗几何（.modal-container / .modal / .modal-content 及全局滚动条规则，
 * 均取自 app.css）的页面里渲染 preview-zkno-combo.html，逐案例对比测量：
 *   - 旧实现（面板绝对定位在输入框下）被弹窗内容区裁掉多少、末尾选项能否命中；
 *   - 新实现（视口浮层）的面板高度、展开方向、滚动条占位、末尾选项能否滚到并点中。
 * 页面自身给出 RESULT: PASS/FAIL，可用无头浏览器 --dump-dom 直接核对；
 * 带 ?hold=N 则保留第 N 个案例的弹窗，便于截图肉眼核对。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const entry = join(root, ".preview-combo-tmp.ts");
const bundlePath = join(root, ".preview-combo-tmp.js");
const htmlOut = join(root, "preview-zkno-combo.html");

writeFileSync(
  entry,
  `import { ComboField } from "./src/combo-field";

export interface MountedCombo {
  el: HTMLElement;
  input: HTMLElement;
  panel: HTMLElement;
  lastCode: () => string | null;
  open: () => void;
}

/** 真实 ComboField：用它测量「新实现」的浮层几何。 */
(globalThis as any).__mountCombo = (mount: HTMLElement, count: number): MountedCombo => {
  const field = new ComboField("选择话题根");
  field.setOptions(
    Array.from({ length: count }, (_, i) => ({
      value: String(i + 1),
      code: String(i + 1),
      title: "第 " + (i + 1) + " 号根话题标题（示例标题会换行）",
    }))
  );
  let last: string | null = null;
  field.onChange((v) => { if (v) last = v; });
  mount.appendChild(field.el);
  const input = field.el.querySelector<HTMLElement>(".zk-show-combo-input")!;
  const panel = field.el.querySelector<HTMLElement>(".zk-show-combo-panel")!;
  return {
    el: field.el,
    input,
    panel,
    lastCode: () => last,
    open: () => input.dispatchEvent(new Event("focus")),
  };
};
`,
  "utf8"
);

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: bundlePath,
  format: "iife",
  globalName: "__zkShowComboPreview",
  platform: "browser",
  target: "chrome110",
  logLevel: "warning",
});
const bundle = readFileSync(bundlePath, "utf8");

const cases = [
  { label: "内容不高（不滚动）", top: 80, tail: 200, count: 20, scroll: false },
  { label: "内容超出弹窗高度（滚到底，锚点贴底边）", top: 700, tail: 60, count: 20, scroll: true },
  { label: "内容超出弹窗高度 · 选项较少", top: 700, tail: 60, count: 4, scroll: true },
];

const caseJson = JSON.stringify(cases);

writeFileSync(
  htmlOut,
  `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>zk-show 弹窗下拉预览</title>
<style>
:root {
  --background-primary: #fff;
  --background-secondary: #f2f3f5;
  --background-secondary-alt: #eceef1;
  --background-modifier-border: #d0d3d8;
  --background-modifier-border-hover: #b0b4ba;
  --background-modifier-accent: rgba(120, 120, 255, .18);
  --interactive-accent: #705dcf;
  --text-normal: #1e1e1e;
  --text-muted: #666;
  --text-faint: #999;
  --text-on-accent: #fff;
  --font-interface: -apple-system, "Segoe UI", sans-serif;
  --font-monospace: Consolas, monospace;
  --radius-l: 8px;
  --scrollbar-bg: transparent;
  --scrollbar-thumb-bg: #c1c1c1;
}
body { margin: 0; padding: 0; font-family: var(--font-interface); background: #f7f8fa; }

/* Obsidian app.css 的全局滚动条规则（用来核对我们的选择器能否压过它） */
body:not(.native-scrollbars) ::-webkit-scrollbar {
  background-color: var(--scrollbar-bg);
  width: 12px;
  height: 12px;
  -webkit-border-radius: var(--radius-l);
  background-color: transparent;
}
body:not(.native-scrollbars) ::-webkit-scrollbar-track { background-color: transparent; }
body:not(.native-scrollbars) ::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-bg);
  -webkit-border-radius: var(--radius-l);
  background-clip: padding-box;
  border: 2px solid transparent;
  border-width: 3px 3px 3px 2px;
}

/* 复刻 Obsidian app.css 的弹窗几何（裁剪是这次要验证的关键） */
.modal-container {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  bottom: 0;
  inset-inline-start: 0;
  width: 100%;
  z-index: 50;
}
.modal-bg { position: absolute; inset: 0; background: rgba(0, 0, 0, .25); }
.modal {
  background-color: var(--background-primary);
  border-radius: 8px;
  padding: 16px;
  position: relative;
  min-height: 100px;
  width: 560px;
  max-width: 560px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .28);
}
.modal-title { font-size: 17px; font-weight: 600; padding: 0 16px 12px; }
.modal-content {
  display: flex;
  position: relative;
  flex-direction: column;
  margin-top: 0;
  overflow: auto;
  padding: 12px;
}
.filler { background: repeating-linear-gradient(45deg, #eef0f4, #eef0f4 8px, #e6e9ef 8px, #e6e9ef 16px); border-radius: 6px; }
.legacy-combo { position: relative; }
.metrics {
  position: fixed;
  left: 8px;
  top: 8px;
  width: 300px;
  max-height: calc(100vh - 16px);
  overflow: auto;
  pointer-events: none;
  z-index: 200;
  font: 11px/1.45 var(--font-monospace);
  background: #fffffff2;
  border: 1px solid #c8ccd4;
  border-radius: 8px;
  padding: 8px 10px;
  white-space: pre-wrap;
}
.metrics h3 { margin: 6px 0 2px; font-size: 11.5px; }
.pass { color: #1a7f37; }
.fail { color: #c0392b; font-weight: 700; }
</style>
<style>${styles}</style>
</head>
<body>
<div class="metrics" id="metrics"></div>
<div class="modal-container" id="modalContainer">
  <div class="modal-bg"></div>
  <div class="modal" id="modal">
    <div class="modal-title">设置 zettelkastenNo</div>
    <div class="modal-content" id="modalContent"></div>
  </div>
</div>
<script>${bundle}</script>
<script>
const CASES = ${caseJson};
const HUD = document.getElementById("metrics");
const modal = document.getElementById("modal");
const content = document.getElementById("modalContent");
const results = [];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function rect(node) { return node.getBoundingClientRect(); }
function scrollbarGap(panel) { return panel.offsetWidth - panel.clientWidth; }

/** 复刻旧实现：面板绝对定位在 .zk-show-combo 内，不做任何高度适配（max-height 240px 取自改动前的 styles.css）。 */
function mountLegacyCombo(mount, count) {
  const combo = el("div", "zk-show-combo legacy-combo");
  const input = document.createElement("input");
  input.className = "zk-show-combo-input";
  input.placeholder = "选择话题根";
  const panel = el("div", "zk-show-combo-panel");
  panel.style.cssText =
    "position:absolute;top:calc(100% + 4px);left:0;right:0;box-sizing:content-box;" +
    "max-height:240px;overflow-y:auto;display:block;";
  for (let i = 1; i <= count; i++) {
    const item = el("div", "zk-show-combo-item");
    item.appendChild(el("span", "zk-show-combo-code", String(i)));
    item.appendChild(el("span", "zk-show-combo-title", "第 " + i + " 号根话题标题（示例标题会换行）"));
    panel.appendChild(item);
  }
  combo.appendChild(input);
  combo.appendChild(panel);
  mount.appendChild(combo);
  return { combo, panel };
}

function hitAt(x, y) { return document.elementFromPoint(x, y); }
function pickable(node) {
  const r = rect(node);
  const hit = hitAt(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && node.contains(hit);
}

/** 量一个滚动条常显面板的占位宽度：宿主决定 Obsidian 全局滚动条规则是否被本插件样式压过。 */
function scrollbarProbe(host) {
  const panel = el("div", "zk-show-combo-panel");
  panel.style.cssText = "display:block;max-height:60px;overflow-y:auto;";
  for (let i = 0; i < 20; i++) panel.appendChild(el("div", "zk-show-combo-item", "第 " + i + " 行"));
  host.appendChild(panel);
  const gap = scrollbarGap(panel);
  panel.remove();
  return gap;
}

/** 滚动条特异性对照：.zk-show-form 内命中本插件规则（10px），其外只剩 Obsidian 全局规则（12px）。 */
function runScrollbarProbe() {
  const form = el("div", "zk-show-form");
  document.body.appendChild(form);
  const inside = scrollbarProbe(form);
  const outside = scrollbarProbe(document.body);
  form.remove();
  return { inside, outside, ok: inside > 0 && (outside === 0 || inside < outside) };
}

/** 滚到底后测量面板/宿主/视口几何、滚动条占位、末尾项可见与命中情况。 */
function measure(panel, host) {
  panel.scrollTop = panel.scrollHeight;
  const items = panel.querySelectorAll(".zk-show-combo-item");
  const last = items[items.length - 1];
  const panelRect = rect(panel);
  const hostRect = rect(host);
  const lastRect = rect(last);
  const overflowsHost = panelRect.bottom - hostRect.bottom;
  return {
    above: panel.classList.contains("is-above"),
    panelTop: Math.round(panelRect.top),
    panelBottom: Math.round(panelRect.bottom),
    hostBottom: Math.round(hostRect.bottom),
    viewportBottom: Math.round(window.innerHeight),
    overflowsHostBy: Math.round(overflowsHost),
    overflowsViewportBy: Math.round(panelRect.bottom - window.innerHeight),
    scrollGap: scrollbarGap(panel),
    scrollable: panel.scrollHeight > panel.clientHeight + 1,
    lastInPanel: lastRect.bottom <= panelRect.bottom + 0.5 && lastRect.top >= panelRect.top - 0.5,
    lastPickable: pickable(last),
    // 面板越过弹窗内容区（旧实现里正是被裁掉的那一段）时，该处是否仍能命中面板内容
    overflowBandPickable: overflowsHost > 0
      ? (() => {
          const hit = hitAt(panelRect.left + 20, hostRect.bottom + 4);
          return !!hit && panel.contains(hit);
        })()
      : null,
  };
}

function buildForm(cfg) {
  content.innerHTML = "";
  const form = el("div", "zk-show-form");
  const top = el("div", "filler");
  top.style.height = cfg.top + "px";
  form.appendChild(top);
  form.appendChild(el("div", "zk-show-form-label", "话题根编号（用于缩小上一级笔记范围）"));
  const mount = el("div", "combo-mount");
  form.appendChild(mount);
  const tail = el("div", "filler");
  tail.style.height = cfg.tail + "px";
  form.appendChild(tail);
  content.appendChild(form);
  return { mount };
}

function scrollToBottom() {
  const scroller = content.scrollHeight > content.clientHeight ? content : modal;
  scroller.scrollTop = scroller.scrollHeight;
}

/** 点击末尾选项，验证「真的能选中」。 */
function clickLast(combo, count) {
  const item = combo.panel.querySelectorAll(".zk-show-combo-item")[count - 1];
  const r = rect(item);
  const hit = hitAt(r.left + r.width / 2, r.top + r.height / 2);
  const target = hit && item.contains(hit) ? hit : item;
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  return combo.lastCode();
}

function runCase(cfg) {
  const legacyBuilt = buildForm(cfg);
  if (cfg.scroll) scrollToBottom();
  const legacy = mountLegacyCombo(legacyBuilt.mount, cfg.count);
  const legacyReport = measure(legacy.panel, content);
  legacy.combo.remove();

  const built = buildForm(cfg);
  if (cfg.scroll) scrollToBottom();
  const combo = globalThis.__mountCombo(built.mount, cfg.count);
  combo.open();
  const report = measure(combo.panel, content);
  const clickedCode = clickLast(combo, cfg.count);

  const checks = [
    ["面板整体在视口内", report.overflowsViewportBy <= 0],
    ["滚动条占位常显（> 2px）", !report.scrollable || report.scrollGap > 2],
    ["滚到底后末尾选项落在面板可视区内", report.lastInPanel],
    ["滚到底后末尾选项可命中", report.lastPickable],
    ["越过弹窗内容区的部分仍可命中（旧实现被裁掉的那段）", report.overflowBandPickable !== false],
    ["点击末尾选项回调正确", clickedCode === String(cfg.count)],
    ["旧实现在同一位置确实被裁掉（回归场景成立）", legacyReport.overflowsHostBy > 0],
    ["旧实现的末尾选项确实点不中（回归场景成立）", legacyReport.lastPickable === false],
  ];
  return { label: cfg.label, count: cfg.count, checks, legacyReport, report, clickedCode };
}

CASES.forEach((cfg) => {
  const result = runCase(cfg);
  results.push(result);
  const box = el("div");
  box.appendChild(el("h3", null, "案例：" + result.label + " · " + result.count + " 个选项"));
  const ok = result.checks.every((c) => c[1]);
  box.appendChild(el("pre", null,
    "旧：" + JSON.stringify(result.legacyReport) + "\\n" +
    "新：" + JSON.stringify(result.report) + "\\n" +
    "点击末尾得到：" + result.clickedCode));
  result.checks.forEach((c) => box.appendChild(el("div", c[1] ? "pass" : "fail", (c[1] ? "  ✓ " : "  ✗ ") + c[0])));
  HUD.appendChild(box);
});

const allOk = results.every((r) => r.checks.every((c) => c[1]));
const probe = runScrollbarProbe();
const probeBox = el("div");
probeBox.appendChild(el("h3", null, "滚动条特异性（Obsidian 全局 12px vs 本插件 10px）"));
probeBox.appendChild(el("pre", null, "form 内：" + probe.inside + "px   form 外：" + probe.outside + "px"));
probeBox.appendChild(el("div", probe.ok ? "pass" : "fail", (probe.ok ? "  ✓ " : "  ✗ ") + "面板内滚动条用本插件的窄滚动条样式"));
HUD.appendChild(probeBox);
HUD.insertBefore(
  el("div", allOk && probe.ok ? "pass" : "fail", "RESULT: " + (allOk && probe.ok ? "PASS" : "FAIL")),
  HUD.firstChild,
);

const hold = new URLSearchParams(location.search).get("hold");
if (hold !== null) {
  const cfg = CASES[Number(hold)] || CASES[0];
  const built = buildForm(cfg);
  if (cfg.scroll) scrollToBottom();
  const combo = globalThis.__mountCombo(built.mount, cfg.count);
  combo.open();
  combo.panel.scrollTop = combo.panel.scrollHeight;
}
</script>
</body>
</html>`,
  "utf8"
);

rmSync(entry, { force: true });
rmSync(bundlePath, { force: true });
console.log("已生成", htmlOut);
