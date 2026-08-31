/**
 * 预览生成脚本（仅开发用）：用真实的 layoutView + renderLayout 逻辑，
 * 在最小 DOM 垫片上渲染 md 中五个示例，输出 preview.html 供肉眼检查版式。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmp = join(__dirname, "..", ".preview-tmp.cjs");
const htmlOut = join(__dirname, "..", "preview.html");

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
  c as any;
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

const CARDS = ["1","1/1","1/2","1/3","1/4","1/41","1/42","1/4a","1/4a1","1/4a2","1/4b","1/5"];
const LABELS: Record<string, string> = {
  "1/3": "例1 查看 1/3（主行与未展开分支提示）",
  "1/4": "例3 查看 1/4（数字分支向上、字母分支向下）",
  "1/4a": "例4 查看 1/4a（字母分支右偏与共享虚线）",
  "1/4b": "例5a 查看 1/4b（历史字母兄弟作为来源）",
  "1/41": "例5b 查看 1/41（保留前置数字兄弟）",
};
(globalThis as any).__build = () => {
  const out: any[] = [];
  for (const code of Object.keys(LABELS)) {
    const idx = new ThreadIndex(CARDS.map((c, i) => ({ path: "k" + i + ".md", basename: "卡" + i, no: c })));
    const vr = computeView(idx, code)!;
    const layout = layoutView(vr);
    const container = (globalThis as any).__container();
    renderLayout(layout, container);
    out.push({ code, label: LABELS[code], width: layout.width, height: layout.height, tree: container });
  }
  return out;
};
`;

await esbuild.build({
  stdin: { contents: entry, resolveDir: __dirname, sourcefile: "preview-entry.ts", loader: "ts" },
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
const results = globalThis.__build();

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function style(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}:${v};`).join("");
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
  if (el.tag === "div" && el.attrs["class"] && el.attrs["class"].startsWith("zk-show-card") ) {
    const cls = el.attrs["class"] || "";
    const title = el.children.find((c) => c.attrs["class"] === "zk-show-title");
    const code = el.children.find((c) => c.attrs["class"] === "zk-show-code");
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
<title>zk-show 预览</title>
<style>
:root{--text-normal:#1f2937;--text-muted:#6b7280;--text-faint:#9ca3af;--text-accent:#2563eb;--text-on-accent:#fff;--background-secondary:#f3f4f6;
--background-modifier-border:#d1d5db;--background-modifier-border-hover:#9ca3af;--text-accent-hover:#1d4ed8}
body{font-family:system-ui,sans-serif;margin:24px;background:#fff;color:var(--text-normal)}
h2{font-size:15px}.mono{color:var(--text-muted);font-size:12px}
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
<h1>zk-show 渲染预览（真实线段版）</h1>
${blocks}
</body>
</html>`;

writeFileSync(htmlOut, html, "utf-8");
rmSync(tmp, { force: true });
console.log("preview written:", htmlOut);
