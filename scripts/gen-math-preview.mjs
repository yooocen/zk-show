/**
 * 预览生成脚本（仅开发用）：渲染数学话题 25 张卡片的关系视图为 preview-math.html。
 * 参考 gen-real-preview.mjs 的 HTML 模板与 fake-DOM 方案，records 用 25 张数学卡片。
 */
import esbuild from "esbuild";
import { writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmp = join(__dirname, "..", ".preview-math-tmp.cjs");
const htmlOut = join(__dirname, "..", "preview-math.html");

const records = [
  { path: "数学.md", basename: "数学", no: "1" },
  { path: "线性代数.md", basename: "线性代数", no: "1/1" },
  { path: "线性代数绪论.md", basename: "线性代数绪论", no: "1/11" },
  { path: "四个基本子空间.md", basename: "四个基本子空间", no: "1/11a" },
  { path: "向量空间.md", basename: "向量空间", no: "1/11a1" },
  { path: "分量数.md", basename: "分量数", no: "1/11a2" },
  { path: "主元与秩.md", basename: "主元与秩", no: "1/11b" },
  { path: "线性无关.md", basename: "线性无关", no: "1/11c" },
  { path: "阶梯形非零行无关证明.md", basename: "阶梯形非零行无关证明", no: "1/11c1" },
  { path: "矩阵乘法技巧.md", basename: "矩阵乘法技巧", no: "1/11d" },
  { path: "第1章-向量引论.md", basename: "第1章-向量引论", no: "1/12" },
  { path: "第2章 求解线性方程组.md", basename: "第2章 求解线性方程组", no: "1/13" },
  { path: "为什么每个方程代表一个平面.md", basename: "为什么每个方程代表一个平面", no: "1/13a" },
  { path: "对解集是仿射子空间的解释.md", basename: "对解集是仿射子空间的解释", no: "1/13a1" },
  { path: "为什么两解的连线仍在解集里.md", basename: "为什么两解的连线仍在解集里", no: "1/13a11" },
  { path: "第3章 向量空间与子空间.md", basename: "第3章 向量空间与子空间", no: "1/14" },
  { path: "R^n之外的三个向量空间.md", basename: "R^n之外的三个向量空间", no: "1/14a" },
  { path: "第3章 中等难度习题.md", basename: "第3章 中等难度习题", no: "1/141" },
  { path: "第3章 中等难度习题 参考答案.md", basename: "第3章 中等难度习题 参考答案", no: "1/1411" },
  { path: "第4章 正交性质.md", basename: "第4章 正交性质", no: "1/15" },
  { path: "第2章 中等难度习题.md", basename: "第2章 中等难度习题", no: "1/131" },
  { path: "第2章 习题求解 草稿.md", basename: "第2章 习题求解 草稿", no: "1/131a" },
  { path: "LDLT分解存在性证明.md", basename: "LDLT分解存在性证明", no: "1/131a1" },
  { path: "证明LDLT.md", basename: "证明LDLT", no: "1/131a11" },
  { path: "LDLT 数据归纳法中代入步骤补充说明.md", basename: "LDLT 数据归纳法中代入步骤补充说明", no: "1/131a12" },
];
const codes = records.map((r) => String(r.no));

const entry = `
interface FakeEl {
  tag: string | null;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: FakeEl[];
}
function mkEl(tag: string | null, cfg?: { cls?: string; text?: string }): FakeEl {
  const el: FakeEl = { tag, attrs: {}, style: {}, children: [] };
  if (cfg?.cls) el.attrs["class"] = cfg.cls;
  if (cfg?.text !== undefined) el.attrs["data-text"] = cfg.text;
  (el as any).setAttribute = (k: string, v: string) => { el.attrs[k] = v; };
  (el as any).appendChild = (ch: FakeEl) => { el.children.push(ch); };
  (el as any).createDiv = (cfg?: any) => {
    const child = mkEl("div", cfg);
    el.children.push(child);
    return child;
  };
  return el;
}
const doc: any = {
  createElementNS: (_ns: string, tag: string) => mkEl(tag),
};
(globalThis as any).document = doc;
(globalThis as any).__container = () => {
  const c = mkEl("div");
  (c as any).createDiv = (cfg?: any) => {
    const child = mkEl("div", cfg);
    c.children.push(child);
    return child;
  };
  (c as any).appendChild = (ch: FakeEl) => c.children.push(ch);
  (c as any).setAttribute = (k: string, v: string) => { c.attrs[k] = v; };
  return c;
};

import { ThreadIndex, computeView } from "../src/model";
import { layoutView, renderLayout } from "../src/renderer";

(globalThis as any).__build = (recs: any[], cs: string[]) => {
  const idx = new ThreadIndex(recs);
  const out: any[] = [];
  for (const code of cs) {
    const note = recs.find((r) => String(r.no) === code);
    const vr = computeView(idx, code)!;
    const layout = layoutView(vr);
    const container = (globalThis as any).__container();
    renderLayout(layout, container);
    out.push({ code, label: "查看 " + code + (note ? "（" + note.basename + "）" : ""), width: layout.width, height: layout.height, tree: container });
  }
  return out;
};
`;

await esbuild.build({
  stdin: { contents: entry, resolveDir: __dirname, sourcefile: "preview-math-entry.ts", loader: "ts" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2020",
  outfile: tmp,
  logLevel: "error",
});

import { createRequire } from "module";
const require2 = createRequire(import.meta.url);
require2(tmp);
const results = globalThis.__build(records, codes);

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function style(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}:${v};`).join("");
}
function findByClass(el, cls) {
  for (const child of el.children ?? []) {
    if ((child.attrs?.["class"] || "").split(/\s+/).includes(cls)) return child;
    const nested = findByClass(child, cls);
    if (nested) return nested;
  }
  return undefined;
}
function renderTree(el) {
  if (el.tag === "line") {
    const dash = el.attrs["stroke-dasharray"] ? ` stroke-dasharray="${el.attrs["stroke-dasharray"]}"` : "";
    return `<line class="${el.attrs["class"] || ""}" x1="${el.attrs["x1"]}" y1="${el.attrs["y1"]}" x2="${el.attrs["x2"]}" y2="${el.attrs["y2"]}"${dash}/>`;
  }
  if (el.tag === "polyline") {
    const dash = el.attrs["stroke-dasharray"] ? ` stroke-dasharray="${el.attrs["stroke-dasharray"]}"` : "";
    return `<polyline class="${el.attrs["class"] || ""}" points="${el.attrs["points"]}"${dash}/>`;
  }
  if (el.tag === "div" && el.attrs["class"] && el.attrs["class"].startsWith("zk-show-card")) {
    const cls = el.attrs["class"] || "";
    const title = findByClass(el, "zk-show-title");
    const code = findByClass(el, "zk-show-code");
    return `<div class="${cls}" style="${style(el.style)}" title="${esc(el.attrs["title"] || "")}" path="${esc(el.attrs["data-path"] || "")}">${title ? `<span class="zk-show-title">${esc(title.attrs["data-text"] || "")}</span>` : ""}${code ? `<span class="zk-show-code">${esc(code.attrs["data-text"] || "")}</span>` : ""}</div>`;
  }
  return "";
}

const blocks = results.map((r) => {
  const svg = r.tree.children.find((c) => c.attrs["class"] === "zk-show-lines");
  const lines = svg ? svg.children.map(renderTree).join("") : "";
  const cards = r.tree.children.filter((c) => c.attrs["class"] && c.attrs["class"].startsWith("zk-show-card")).map(renderTree).join("");
  return `<section class="demo">
<h2>${esc(r.label)} <span class="mono">(${esc(r.code)})</span></h2>
<div class="viewport"><div class="stage" style="width:${r.width + 40}px;height:${r.height + 40}px"><svg class="zk-show-lines" width="${r.width + 40}" height="${r.height + 40}" viewBox="0 0 ${r.width + 40} ${r.height + 40}">${lines}</svg>${cards}</div></div>
</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<title>zk-show 数学话题渲染预览</title>
<style>
:root{--text-normal:#1f2937;--text-muted:#6b7280;--text-faint:#9ca3af;--text-accent:#2563eb;--text-on-accent:#fff;--background-secondary:#f3f4f6;
--background-modifier-border:#d1d5db;--background-modifier-border-hover:#9ca3af;--text-accent-hover:#1d4ed8}
body{font-family:system-ui,sans-serif;margin:24px;background:#fff;color:var(--text-normal)}
h1{font-size:18px}h2{font-size:15px}.mono{color:var(--text-muted);font-size:12px}
section{margin-bottom:28px}
.viewport{overflow:auto;border:1px dashed #ccc;padding:8px;background:#fafafa}
.stage{position:relative;font-family:ui-monospace,Consolas,monospace}
.zk-show-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.zk-show-lines line,.zk-show-lines polyline{fill:none;stroke:var(--text-muted);stroke-width:1.5;stroke-linecap:round}
.zk-show-lines line.zk-show-vbar,.zk-show-lines polyline.zk-show-poly{stroke-width:2}
.zk-show-lines polyline.zk-show-poly{stroke:var(--text-faint)}
.zk-show-card{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:2px;
padding:6px 12px;border:1.5px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);
line-height:1.3}
.zk-show-card.is-current{border-color:var(--text-accent);background:var(--text-accent)}
.zk-show-card.is-current .zk-show-title,.zk-show-card.is-current .zk-show-code{color:var(--text-on-accent)}
.zk-show-card.is-ghost{border-style:dashed;background:transparent;opacity:.55}
.zk-show-title{font-size:13px;white-space:nowrap}
.zk-show-code{font-size:10px;color:var(--text-muted);white-space:nowrap}
</style>
</head>
<body>
<h1>zk-show 数学话题渲染预览（25 张卡片视图）</h1>
${blocks}
</body>
</html>`;

writeFileSync(htmlOut, html, "utf-8");
rmSync(tmp, { force: true });
console.log("preview written:", htmlOut, "（视图数:", results.length, "）");
