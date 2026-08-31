/**
 * 预览生成脚本（仅开发用）：把真实 vault 中 1 开头 zettelkastenNo 的全部关系视图，
 * 用真实 layoutView + renderLayout 逻辑渲染成 preview-real.html 供肉眼核对。
 */
import esbuild from "esbuild";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmp = join(__dirname, "..", ".preview-tmp.cjs");
const htmlOut = join(__dirname, "..", "preview-real.html");

const ROOT = "C:/Users/cc/7adiu-d2vq6/技术和学习记录";
function walk(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== ".obsidian" && e.name !== "agents") walk(join(dir, e.name), acc);
    } else if (e.name.endsWith(".md")) acc.push(join(dir, e.name));
  }
  return acc;
}
const files = walk(ROOT, []);
const records = [];
for (const fp of files) {
  const head = readFileSync(fp, "utf8").split("\n").slice(0, 6).join("\n");
  const m = head.match(/zettelkastenNo:\s*"?([^"\s]+)/);
  if (m) records.push({ path: fp.replace(ROOT + "/", ""), basename: fp.split("\\").pop().replace(/\.md$/, ""), no: m[1] });
}
records.sort((a, b) => String(a.no).length - String(b.no).length || String(a.no).localeCompare(String(b.no)));
const codes = [...new Set(records.map((r) => String(r.no)))].filter((c) => c.startsWith("1")).sort();

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

(globalThis as any).__build = (recs: any[], codes: string[]) => {
  const idx = new ThreadIndex(recs);
  const out: any[] = [];
  for (const code of codes) {
    const note = recs.find((r) => String(r.no) === code);
    const vr = computeView(idx, code)!;
    const layout = layoutView(vr);
    const container = (globalThis as any).__container();
    renderLayout(layout, container);
    out.push({
      code,
      label: "查看 " + code + (note ? "（" + note.basename + "）" : ""),
      width: layout.width,
      height: layout.height,
      tree: container,
      markers: layout.markers,
      markerNodes: Object.fromEntries(layout.markers.flatMap((marker) => marker.hiddenIds.map((id) => {
        const node = idx.node(id);
        return [id, { title: node?.title ?? id, isGhost: node?.isGhost ?? true }];
      }))),
    });
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
const results = globalThis.__build(records, codes);

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
  if (el.tag === "div" && el.attrs["class"] && el.attrs["class"].startsWith("zk-show-card")) {
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
  const markers = r.markers.map((marker) => {
    const label = marker.kind === "offTopic" ? "隐藏题外分支" : marker.kind === "fold" ? "已折叠内容" : marker.kind === "sourceTail" ? "隐藏来源后续" : "隐藏连续内容";
    const dashed = marker.dashed ? " dashed" : "";
    return `<g class="zk-show-hint-marker${dashed}" data-hint-id="${esc(marker.id)}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${marker.x} ${marker.y})"><title>${esc(label)}</title><circle class="zk-show-hint-hit" r="12"/><circle class="zk-show-hint-pulse" r="8"/><circle class="zk-show-hint-dot" r="4"/></g>`;
  }).join("");
  const hintPayload = JSON.stringify(r.markers.map((marker) => ({
    id: marker.id,
    label: marker.label,
    description: marker.description,
    sourceId: marker.sourceId,
    hiddenIds: marker.hiddenIds,
    nodes: Object.fromEntries(marker.hiddenIds.map((id) => [id, r.markerNodes[id]])),
  }))).replace(/</g, "\\u003c");
  return `<section class="demo">
<h2>${esc(r.label)} <span class="mono">(${esc(r.code)})</span></h2>
<div class="viewport"><div class="stage" style="width:${r.width + 40}px;height:${r.height + 40}px"><svg class="zk-show-lines" width="${r.width + 40}" height="${r.height + 40}" viewBox="0 0 ${r.width + 40} ${r.height + 40}">${lines}${markers}</svg>${cards}<script type="application/json" class="zk-show-hint-payload">${hintPayload}</script></div></div>
</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<title>zk-show 真实 vault 预览</title>
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
.zk-show-hint-marker{pointer-events:all;cursor:help;outline:none}
.zk-show-hint-hit{fill:transparent;stroke:none}
.zk-show-hint-dot{fill:#fff;stroke:var(--text-faint);stroke-width:1.5;transition:fill .15s ease,stroke .15s ease,r .15s ease}
.zk-show-hint-pulse{fill:none;stroke:var(--text-accent);stroke-width:1.5;opacity:0;transition:opacity .15s ease}
.zk-show-hint-marker:hover .zk-show-hint-dot,.zk-show-hint-marker:focus .zk-show-hint-dot{fill:var(--text-accent);stroke:var(--text-accent);r:4.5}
.zk-show-hint-marker:hover .zk-show-hint-pulse,.zk-show-hint-marker:focus .zk-show-hint-pulse{opacity:.22}
.zk-show-hint-marker.dashed .zk-show-hint-dot{stroke-dasharray:2 2}
.zk-show-hint-popover{position:absolute;z-index:4;width:240px;max-height:220px;overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--background-modifier-border);border-radius:12px;background:#fff;box-shadow:0 10px 28px rgb(0 0 0 / .18);font-family:system-ui,sans-serif}
.zk-show-hint-popover-title{font-weight:600;font-size:13px;margin-bottom:4px}
.zk-show-hint-popover-description,.zk-show-hint-popover-source{font-size:11px;line-height:1.5;color:var(--text-muted)}
.zk-show-hint-popover-source{margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border)}
.zk-show-hint-node{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:5px 6px;margin-top:4px;border-radius:6px;font-size:11px;cursor:pointer}
.zk-show-hint-node:hover,.zk-show-hint-node:focus{outline:none;background:#eef2ff;color:var(--text-accent)}
.zk-show-hint-node.is-ghost{cursor:default;opacity:.5}
.zk-show-hint-node-code{font-family:ui-monospace,Consolas,monospace;color:var(--text-accent)}
.zk-show-hint-node-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
<h1>zk-show 真实 vault 渲染预览（1 开头全部视图）</h1>
${blocks}
<script>
(() => {
  const close = (stage) => stage.querySelector('.zk-show-hint-popover')?.remove();
  const open = (stage, marker, data) => {
    close(stage);
    const pop = document.createElement('div');
    pop.className = 'zk-show-hint-popover';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = '<div class="zk-show-hint-popover-title"></div><div class="zk-show-hint-popover-description"></div><div class="zk-show-hint-popover-source"></div><div class="zk-show-hint-popover-list"></div>';
    pop.querySelector('.zk-show-hint-popover-title').textContent = data.label;
    pop.querySelector('.zk-show-hint-popover-description').textContent = data.description;
    pop.querySelector('.zk-show-hint-popover-source').textContent = '来源：' + data.sourceId;
    const list = pop.querySelector('.zk-show-hint-popover-list');
    for (const code of data.hiddenIds || []) {
      const item = document.createElement('div');
      const node = data.nodes?.[code] || { title: code, isGhost: true };
      item.className = 'zk-show-hint-node' + (node.isGhost ? ' is-ghost' : '');
      item.tabIndex = 0;
      item.innerHTML = '<span class="zk-show-hint-node-code"></span><span class="zk-show-hint-node-title"></span>';
      item.querySelector('.zk-show-hint-node-code').textContent = code;
      item.querySelector('.zk-show-hint-node-title').textContent = node.title;
      list.appendChild(item);
    }
    const stageRect = stage.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const markerX = markerRect.left - stageRect.left + markerRect.width / 2;
    const markerY = markerRect.top - stageRect.top + markerRect.height / 2;
    pop.style.left = Math.max(8, Math.min(markerX + 14, stage.clientWidth - 248)) + 'px';
    pop.style.top = Math.max(8, Math.min(markerY + 14, stage.clientHeight - 228)) + 'px';
    stage.appendChild(pop);
  };
  document.querySelectorAll('.demo').forEach((section) => {
    const stage = section.querySelector('.stage');
    const payload = JSON.parse(section.querySelector('.zk-show-hint-payload')?.textContent || '[]');
    const byId = new Map(payload.map((item) => [item.id, item]));
    stage.addEventListener('click', (event) => {
      const marker = event.target.closest('.zk-show-hint-marker');
      if (marker) {
        event.stopPropagation();
        const data = byId.get(marker.dataset.hintId);
        if (!data) return;
        if (stage.querySelector('.zk-show-hint-popover')?.dataset.markerId === data.id) close(stage);
        else {
          open(stage, marker, data);
          stage.querySelector('.zk-show-hint-popover').dataset.markerId = data.id;
        }
        return;
      }
      if (!event.target.closest('.zk-show-hint-popover')) close(stage);
    });
    stage.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close(stage);
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.zk-show-hint-marker')) {
        event.preventDefault();
        event.target.closest('.zk-show-hint-marker').click();
      }
    });
  });
})();
</script>
</body>
</html>`;

writeFileSync(htmlOut, html, "utf-8");
rmSync(tmp, { force: true });
console.log("preview written:", htmlOut, "（视图数:", results.length, "）");
