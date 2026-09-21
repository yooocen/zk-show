# 多 zkNo 支持与话题切换下拉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一个 md 支持多个 zettelkastenNo（逗号/空格/分号/数组分隔），图谱一次聚焦一个并新增「笔记话题」下拉按根话题切换聚焦，且持久记住每个 md 上次的话题。

**Architecture:** 解析层新增 `parseZettelkastenNoList` 纯函数；`collectRecords` 每编码压入一条记录；视图新增 `ZkNoSwitch` 下拉组件（复用 topic-switch 样式），聚焦码由插件持久数据（`loadData/saveData`）决定并回退 `codes[0]`；不改变现有 TopicGraph/projection/layout 逻辑。

**Tech Stack:** TypeScript、Obsidian plugin API、vitest + happy-dom。

---

## 文件结构

- Modify: `src/parser.ts` — 新增 `parseZettelkastenNoList`
- Modify: `src/main.ts` — collectRecords 多编码、视图聚焦解析、持久化、ZkNoSwitch 接线
- Create: `src/zkno-switch.ts` — `ZkNoSwitch` 组件 + `deriveZkNoSwitchOptions` 纯函数
- Modify: `styles.css` — 新增 `.zk-show-zkno-switch` 定位
- Test: `test/parser.test.ts`、`test/topic-graph.test.ts`、`test/zkno-switch.test.ts`

运行测试：`npm test`（`vitest run`）。构建：`npm run build`。

---

### Task 1: 解析多 zkNo —— `parseZettelkastenNoList`

**Files:**
- Modify: `src/parser.ts`（在文件末尾追加）
- Test: `test/parser.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/parser.test.ts` 顶部追加导入：

```ts
import { parseZettelkastenNoList } from "../src/parser";
```

在文件末尾追加：

```ts
describe("parseZettelkastenNoList", () => {
  it("逗号/空格/分号/混合分隔", () => {
    expect(parseZettelkastenNoList("1/4a, 2/3b")).toEqual(["1/4a", "2/3b"]);
    expect(parseZettelkastenNoList("1/4a;2/3b; 5")).toEqual(["1/4a", "2/3b", "5"]);
    expect(parseZettelkastenNoList("1/4a  2/3b 5/a")).toEqual(["1/4a", "2/3b", "5/a"]);
    expect(parseZettelkastenNoList("1/4a,; 2/3b")).toEqual(["1/4a", "2/3b"]);
  });

  it("YAML 数组输入，元素可为字符串或数字", () => {
    expect(parseZettelkastenNoList(["1/4a", "2/3b"])).toEqual(["1/4a", "2/3b"]);
    expect(parseZettelkastenNoList([1, "2/a"])).toEqual(["1", "2/a"]);
  });

  it("数字输入与引号包裹", () => {
    expect(parseZettelkastenNoList(2)).toEqual(["2"]);
    expect(parseZettelkastenNoList('"1/4a, 2/3b"')).toEqual(["1/4a", "2/3b"]);
  });

  it("去重并保持先后顺序", () => {
    expect(parseZettelkastenNoList("1/4a, 1/4a, 2, 1/4a")).toEqual(["1/4a", "2"]);
  });

  it("非法段与空输入返回空数组", () => {
    expect(parseZettelkastenNoList("")).toEqual([]);
    expect(parseZettelkastenNoList("   , ; ")).toEqual([]);
    expect(parseZettelkastenNoList(undefined)).toEqual([]);
    expect(parseZettelkastenNoList(null)).toEqual([]);
    expect(parseZettelkastenNoList(["", "1/"])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/parser.test.ts`
Expected: FAIL，`parseZettelkastenNoList is not a function`

- [ ] **Step 3: 实现**

在 `src/parser.ts` 末尾追加：

```ts
/**
 * 解析 zettelkastenNo 的多个值（逗号 / 空格 / 分号分隔，或 YAML 数组）。
 * 返回按出现顺序去重后的规范码；无有效编码时返回空数组。
 */
export function parseZettelkastenNoList(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (typeof part === "number") {
      const parsed = parseZettelkastenNo(String(part));
      if (parsed && !seen.has(parsed.canonical)) {
        seen.add(parsed.canonical);
        out.push(parsed.canonical);
      }
      continue;
    }
    if (typeof part !== "string") continue;
    for (const chunk of splitZettelkastenNoValue(part)) {
      // 悬空斜杠（如 "1/"）视为非法段跳过，与测试契约一致
      if (chunk.endsWith("/")) continue;
      const parsed = parseZettelkastenNo(chunk);
      if (parsed && !seen.has(parsed.canonical)) {
        seen.add(parsed.canonical);
        out.push(parsed.canonical);
      }
    }
  }
  return out;
}

/** 去掉外层引号后按分隔符切分多编码字符串。 */
function splitZettelkastenNoValue(s: string): string[] {
  let t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      t = t.slice(1, -1).trim();
    }
  }
  return t === "" ? [] : t.split(/[,\s;]+/).filter((x) => x !== "");
}
```

> 说明：`chunk.endsWith("/")` 为满足本任务测试契约（`["", "1/"]` → `[]`）而加入，不改变 `parseZettelkastenNo` 单值行为。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/parser.test.ts`
Expected: PASS（全部用例通过）

- [ ] **Step 5: 提交**

```bash
git add src/parser.ts test/parser.test.ts
git commit -m "feat: 支持解析多个 zettelkastenNo（逗号/空格/分号/数组）"
```

---

### Task 2: TopicGraph 单文件多编码行为测试

**Files:**
- Test: `test/topic-graph.test.ts`

TopicGraph 已支持同路径不同规范码建出多个节点（`actual` 以 canonical 为键），无需实现改动，补行为测试固化。

- [ ] **Step 1: 写测试**

在 `test/topic-graph.test.ts` 的 `describe("TopicGraph")` 内追加：

```ts
it("同一文件多 zkNo 生成共用路径的多个节点", () => {
  const graph = new TopicGraph([
    { path: "a.md", basename: "多主题", no: "1/4a" },
    { path: "a.md", basename: "多主题", no: "2/3b" },
  ]);

  expect(graph.node("1/4a")).toMatchObject({ path: "a.md", isGhost: false, title: "多主题" });
  expect(graph.node("2/3b")).toMatchObject({ path: "a.md", isGhost: false, title: "多主题" });
});
```

- [ ] **Step 2: 运行确认通过**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add test/topic-graph.test.ts
git commit -m "test: 固化单文件多 zkNo 建图行为"
```

---

### Task 3: collectRecords 支持多编码

**Files:**
- Modify: `src/main.ts:82-96`（`collectRecords`）

- [ ] **Step 1: 改实现**

把 `src/main.ts` 的导入替换：

```ts
import { normalizeZettelkastenNo } from "./parser";
```

改为：

```ts
import { parseZettelkastenNoList } from "./parser";
```

把 `collectRecords` 主体改为（替换方法内从 `const no = ...` 到 `records.push(...)` 的部分）：

```ts
  private collectRecords(): ZRecord[] {
    const records: ZRecord[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      const codes = parseZettelkastenNoList(cache?.frontmatter?.zettelkastenNo);
      if (codes.length === 0) continue;
      const links = scanInlineLinks([...(cache?.links ?? []), ...(cache?.embeds ?? [])], f.path, (link, sourcePath) => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
        return target ? { path: target.path, title: target.extension === "md" ? target.basename : target.name } : null;
      });
      for (const no of codes) {
        records.push({ path: f.path, basename: f.basename, no, links });
      }
    }
    return records;
  }
```

- [ ] **Step 2: 无类型错误编译检查**

Run: `npx tsc --noEmit`
Expected: 无报错（`normalizeZettelkastenNo` 不再被引用；若其他地方仍引用需一并替换）

- [ ] **Step 3: 运行全部现有测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/main.ts
git commit -m "feat: collectRecords 为每个 zettelkastenNo 生成一条索引记录"
```

---

### Task 4: `deriveZkNoSwitchOptions` 纯函数

**Files:**
- Create: `src/zkno-switch.ts`（先只写纯函数 + 类型）
- Test: `test/zkno-switch.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/zkno-switch.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { deriveZkNoSwitchOptions } from "../src/zkno-switch";
import { TopicGraph } from "../src/topic-graph";

describe("deriveZkNoSwitchOptions", () => {
  it("按先后顺序去重根话题，标题取真实根/幽灵回退编码", () => {
    const graph = new TopicGraph([
      { path: "r1.md", basename: "数学", no: "1" },
      { path: "a.md", basename: "多主题", no: "1/4a" },
      { path: "a.md", basename: "多主题", no: "2/3b" },
      { path: "a.md", basename: "多主题", no: "1/2" },
    ]);

    expect(deriveZkNoSwitchOptions(["1/4a", "2/3b", "1/2"], graph)).toEqual([
      { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
      { rootCode: "2", rootTitle: "2", zkNo: "2/3b" },
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: FAIL，`Cannot find module '../src/zkno-switch'`

- [ ] **Step 3: 实现纯函数**

创建 `src/zkno-switch.ts`：

```ts
import type { TopicGraph } from "./topic-graph";

export interface ZkNoSwitchOption {
  rootCode: string;
  rootTitle: string;
  /** 该文件在此根话题下对应的 zkNo（首个）。 */
  zkNo: string;
}

/** 按编码出现顺序去重根话题，生成下拉选项。 */
export function deriveZkNoSwitchOptions(codes: string[], graph: TopicGraph): ZkNoSwitchOption[] {
  const seen = new Set<string>();
  const out: ZkNoSwitchOption[] = [];
  for (const code of codes) {
    const root = graph.rootOf(code);
    if (seen.has(root)) continue;
    seen.add(root);
    const rootNode = graph.node(root);
    out.push({
      rootCode: root,
      rootTitle: rootNode && !rootNode.isGhost ? rootNode.title : root,
      zkNo: code,
    });
  }
  return out;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/zkno-switch.ts test/zkno-switch.test.ts
git commit -m "feat: 派生多 zkNo 笔记的话题切换下拉选项"
```

---

### Task 5: `ZkNoSwitch` 组件与样式

**Files:**
- Modify: `src/zkno-switch.ts`（追加组件类）
- Modify: `styles.css`（末尾追加定位块）
- Test: `test/zkno-switch.test.ts`（追加组件测试）

- [ ] **Step 1: 写失败测试**

在 `test/zkno-switch.test.ts` 顶部改为：

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { deriveZkNoSwitchOptions, ZkNoSwitch } from "../src/zkno-switch";
import { TopicGraph } from "../src/topic-graph";
```

在文件末尾追加：

```ts
describe("ZkNoSwitch", () => {
  it("少于 2 个选项时隐藏", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render([{ rootCode: "1", rootTitle: "数学", zkNo: "1/4a" }], "1/4a");
    expect(sw.el.style.display).toBe("none");
    sw.destroy();
  });

  it("渲染选项，点击回调返回 zkNo", () => {
    const sw = new ZkNoSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
      ],
      "1/4a"
    );
    expect(sw.el.style.display).toBe("block");
    const items = sw.el.querySelectorAll(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-topic-switch-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-topic-switch-title")?.textContent).toContain("数学");
    (items[1] as HTMLElement).click();
    expect(handler).toHaveBeenCalledWith("2/3b");
    sw.destroy();
  });

  it("外部点击收起面板", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
      ],
      null
    );
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!.click();
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: FAIL，`ZkNoSwitch is not a constructor`

- [ ] **Step 3: 实现组件**

在 `src/zkno-switch.ts` 末尾追加：

```ts
/**
 * 右上角「笔记话题」下拉：仅当当前笔记有多个 zkNo 时显示，
 * 列出其涉及的去重根话题，选中后切换图谱聚焦（不切换当前笔记）。
 * 内部元素复用 .zk-show-topic-switch-* 样式。
 */
export class ZkNoSwitch {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private options: ZkNoSwitchOption[] = [];
  private selectedZkNo: string | null = null;
  private selectHandler: (zkNo: string) => void = () => {};
  private readonly outsidePointerHandler: (ev: PointerEvent) => void;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "zk-show-zkno-switch";
    this.el.style.display = "none";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "zk-show-topic-switch-trigger";
    this.button.textContent = "笔记话题";
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this.close();
    });

    this.panel = document.createElement("div");
    this.panel.className = "zk-show-topic-switch-panel";
    this.panel.setAttribute("role", "listbox");

    this.el.appendChild(this.button);
    this.el.appendChild(this.panel);

    this.outsidePointerHandler = (ev) => {
      if (ev.target instanceof Node && !this.el.contains(ev.target)) this.close();
    };
    document.addEventListener("pointerdown", this.outsidePointerHandler);
  }

  /** 每次 refresh 调用：少于 2 个选项时隐藏。 */
  render(options: ZkNoSwitchOption[], selectedZkNo: string | null): void {
    this.options = options;
    this.selectedZkNo = selectedZkNo;
    if (options.length < 2) {
      this.el.style.display = "none";
      this.close();
      return;
    }
    this.el.style.display = "block";
    this.renderPanel();
  }

  onChange(handler: (zkNo: string) => void): void {
    this.selectHandler = handler;
  }

  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.outsidePointerHandler);
    this.el.remove();
  }

  private toggle(): void {
    const isOpen = this.panel.classList.toggle("is-open");
    this.button.setAttribute("aria-expanded", String(isOpen));
  }

  private renderPanel(): void {
    this.panel.innerHTML = "";
    for (const option of this.options) {
      const item = document.createElement("div");
      item.className = "zk-show-topic-switch-item";
      item.setAttribute("role", "option");
      if (option.zkNo === this.selectedZkNo) item.classList.add("is-selected");
      const code = document.createElement("span");
      code.className = "zk-show-topic-switch-code";
      code.textContent = option.rootCode;
      const title = document.createElement("span");
      title.className = "zk-show-topic-switch-title";
      title.textContent = `${option.rootTitle}（${option.zkNo}）`;
      item.appendChild(code);
      item.appendChild(title);
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => {
        this.selectedZkNo = option.zkNo;
        this.selectHandler(option.zkNo);
        this.close();
      });
      item.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          item.click();
        }
      });
      this.panel.appendChild(item);
    }
  }
}
```

- [ ] **Step 4: 加样式**

在 `styles.css` 末尾追加：

```css
/* ===== 右上角笔记话题切换（多 zkNo 笔记） ===== */
.zk-show-zkno-switch {
  position: absolute;
  top: 42px;
  right: 8px;
  z-index: 40;
  font-family: var(--font-interface);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: PASS（3 个组件用例 + 1 个纯函数用例）

- [ ] **Step 6: 提交**

```bash
git add src/zkno-switch.ts styles.css test/zkno-switch.test.ts
git commit -m "feat: 新增多 zkNo 笔记的话题切换下拉组件"
```

---

### Task 6: 插件持久化记忆

**Files:**
- Modify: `src/main.ts`（插件类）

- [ ] **Step 1: 加数据接口与字段**

在 `src/main.ts` 顶部、`export const VIEW_TYPE_ZK_SHOW` 之前追加：

```ts
interface ZkShowData {
  /** path → 该 md 上次聚焦的 zkNo 编码。 */
  lastTopicByPath?: Record<string, string>;
}
```

在 `ZkShowPlugin` 类内、`private view` 上方追加字段：

```ts
  private data: ZkShowData = {};
```

- [ ] **Step 2: 加载数据**

在 `onload()` 的 `this.registerEvent(...)` 之后追加：

```ts
    void this.loadData().then((data) => {
      this.data = Object.assign({}, (data as ZkShowData) ?? {});
      this.view?.refresh();
    });
```

- [ ] **Step 3: 加两个方法**

在 `ZkShowPlugin` 类内追加（放在 `scheduleRebuild` 之后）：

```ts
  /** 返回该文件应聚焦的编码：持久记忆有效则沿用，否则取第一个。 */
  lastTopicForPath(path: string, codes: string[]): string {
    const remembered = this.data.lastTopicByPath?.[path];
    return remembered && codes.includes(remembered) ? remembered : codes[0];
  }

  rememberTopic(path: string, code: string): void {
    if (!this.data.lastTopicByPath) this.data.lastTopicByPath = {};
    this.data.lastTopicByPath[path] = code;
    void this.saveData(this.data);
  }
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 5: 提交**

```bash
git add src/main.ts
git commit -m "feat: 持久化记住每个 md 上次聚焦的 zkNo 话题"
```

---

### Task 7: 视图接线 —— 聚焦解析、切换、下拉实例

**Files:**
- Modify: `src/main.ts`（`ZkShowView`）

- [ ] **Step 0: 持久化加固（Task 6 遗留质量项）**

在 `ZkShowPlugin` 类内 `private data: ZkShowData = {};` 下方追加：

```ts
  private dataReady: Promise<void> = Promise.resolve();
```

把 `onload()` 里的 loadData 块改为合并式并记录 dataReady：

```ts
    this.dataReady = this.loadData().then((data) => {
      this.data = Object.assign({}, (data as ZkShowData) ?? {}, this.data);
      this.view?.refresh();
    });
```

把 `rememberTopic` 改为 async、等待 dataReady、值未变短路（避免覆盖竞态与无谓写盘）：

```ts
  async rememberTopic(path: string, code: string): Promise<void> {
    await this.dataReady;
    if (this.data.lastTopicByPath?.[path] === code) return;
    if (!this.data.lastTopicByPath) this.data.lastTopicByPath = {};
    this.data.lastTopicByPath[path] = code;
    void this.saveData(this.data);
  }
```

- [ ] **Step 1: 更新导入与字段**

`src/main.ts` 顶部新增导入：

```ts
import { deriveZkNoSwitchOptions, ZkNoSwitch } from "./zkno-switch";
```

在 `ZkShowView` 类内、`private navButtons` 下方追加字段：

```ts
  private zkNoSwitch: ZkNoSwitch | null = null;
  private activeCodes: string[] | null = null;
```

- [ ] **Step 2: `resolveActiveCode` 改为 `resolveActiveCodes`**

将 `ZkShowView` 中的 `resolveActiveCode` 方法整体替换为：

```ts
  private resolveActiveCodes(active: TFile | null): string[] | null {
    if (!active) {
      this.empty("打开一篇带 zettelkastenNo 前台的笔记，这里会展示它与其他卡片的关系。");
      return null;
    }
    const codes = parseZettelkastenNoList(this.app.metadataCache.getFileCache(active)?.frontmatter?.zettelkastenNo);
    if (codes.length === 0) {
      this.empty(`当前笔记「${active.basename}」没有有效的 zettelkastenNo 前台编码，无法参与关系展示。`);
      return null;
    }
    return codes;
  }
```

- [ ] **Step 3: 点卡同步记忆 + 新增 `switchFocus` 方法**

在 `navigateToCode` 方法体内、`this.focusCode = code;` 这一行之前插入一行，让点击图谱中当前文件的其他 zkNo 卡也能更新持久记忆：

```ts
    if (path && this.activeCodes?.includes(code)) this.plugin.rememberTopic(path, code);
```

在 `navigateToCode` 方法之后追加 `switchFocus`：

```ts
  /** 在不切换当前笔记的前提下，把图谱聚焦切换到该笔记的另一个 zkNo。 */
  private switchFocus(code: string, path: string | null): void {
    if (path && this.activeCodes?.includes(code)) this.plugin.rememberTopic(path, code);
    this.focusCode = code;
    this.focusExpectedPath = null;
    this.refresh(true);
    this.centerCanvas();
  }
```

- [ ] **Step 4: `onClose` 释放组件**

在 `onClose()` 中、`this.navButtons?.destroy()` 之后追加：

```ts
    this.zkNoSwitch?.destroy();
    this.zkNoSwitch = null;
```

- [ ] **Step 5: `refresh` 接线**

在 `refresh()` 中、`if (!this.navButtons) {...}` 块之后追加创建逻辑：

```ts
    // 「笔记话题」下拉：多 zkNo 笔记切换聚焦，仅创建一次
    if (!this.zkNoSwitch) {
      this.zkNoSwitch = new ZkNoSwitch();
      this.zkNoSwitch.onChange((zkNo) => {
        const active = this.app.workspace.getActiveFile();
        this.switchFocus(zkNo, active?.path ?? null);
      });
      root.appendChild(this.zkNoSwitch.el);
    }
```

把 refresh 中这段：

```ts
    const active = this.app.workspace.getActiveFile();
    const code = pinned ? this.focusCode : this.resolveActiveCode(active);
    if (!pinned) {
      this.focusCode = code;
      this.focusExpectedPath = null;
    }
    this.topicSwitch?.setSelected(
      code !== null && !this.plugin.index.node(code)?.isGhost ? code : null
    );
    if (code === null) {
      this.updateNavButtons();
      return;
    }
```

整体替换为：

```ts
    const active = this.app.workspace.getActiveFile();
    const codes = this.resolveActiveCodes(active);
    const code = pinned ? this.focusCode : codes !== null && active ? this.plugin.lastTopicForPath(active.path, codes) : null;
    if (!pinned) {
      this.focusCode = code;
      this.focusExpectedPath = null;
    }
    this.activeCodes = codes !== null && codes.length > 1 ? codes : null;
    this.topicSwitch?.setSelected(
      code !== null && !this.plugin.index.node(code)?.isGhost ? code : null
    );
    this.zkNoSwitch?.render(
      this.activeCodes ? deriveZkNoSwitchOptions(this.activeCodes, this.plugin.index) : [],
      code
    );
    if (code === null) {
      this.updateNavButtons();
      return;
    }
```

- [ ] **Step 6: pointer 事件忽略新增下拉**

把 `ZkShowView` 中 3 处（`onPointerDown`、`onPointerMove`、`onPointerEnd`）的：

```ts
      ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch, .zk-show-nav-buttons")
```

改为：

```ts
      ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch, .zk-show-zkno-switch, .zk-show-nav-buttons")
```

- [ ] **Step 7: 组件高亮按根匹配（Task 5 遗留质量项）**

修改 `src/zkno-switch.ts` 的 `renderPanel`：高亮判定从 `option.zkNo === this.selectedZkNo` 改为「选项根与当前聚焦码的根一致」——同根多 zkNo 时聚焦非首个码，下拉仍高亮该根。在 `renderPanel` 内顶部加：

```ts
    const selectedRoot = this.selectedZkNo ? this.selectedZkNo.split("/")[0] : null;
```

并把高亮行：

```ts
      if (option.zkNo === this.selectedZkNo) item.classList.add("is-selected");
```

改为：

```ts
      if (option.rootCode === selectedRoot) item.classList.add("is-selected");
```

在 `test/zkno-switch.test.ts` 追加用例：

```ts
  it("同根多码时按根高亮非首个码", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
      ],
      "2/9c"
    );
    const selected = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item.is-selected");
    expect(selected?.querySelector(".zk-show-topic-switch-code")?.textContent).toBe("2");
    sw.destroy();
  });
```

运行：`npx vitest run test/zkno-switch.test.ts`，Expected: 7 个用例全 PASS。

- [ ] **Step 8: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 9: 提交**

```bash
git add src/main.ts src/zkno-switch.ts test/zkno-switch.test.ts
git commit -m "feat: 视图接入笔记话题下拉并支持多 zkNo 聚焦记忆"
```

---

### Task 8: 全量验证

**Files:** 无

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部 PASS（含新增 parser / topic-graph / zkno-switch 用例）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 无报错，产出 `main.js`

- [ ] **Step 3: 手工冒烟清单（Obsidian 内）**
  1. 某笔记 frontmatter 写 `zettelkastenNo: "1/4a, 2/3b"` → 打开图谱：默认聚焦 1/4a，右上角出现「笔记话题」下拉，列出根 1、2。
  2. 下拉选根 2 → 图谱切到 2/3b 聚焦，当前笔记不变。
  3. 关闭图谱视图再打开 → 仍聚焦 2/3b（持久记忆生效）。
  4. 把 frontmatter 改为单值 `1/4a` → 下拉消失；改回多值 → 若记忆失效回退第一个。
  5. 单 zkNo 笔记不显示「笔记话题」下拉，原「切换zk话题」行为不变。

- [ ] **Step 4: 提交（如有残留）**

```bash
git add -A
git commit -m "chore: 多 zkNo 支持收尾"
```
