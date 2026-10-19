# 切换 zk 话题下拉滚动与根话题顺序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「切换zk话题」下拉在任意视图高度下都能滚到底并选中末尾选项，根话题只列出真实存在且按数值升序排列。

**Architecture:** 数据层把根话题收敛为「真实存在的根 + 数值序」；交互层新增 `src/dropdown-panel.ts` 负责展开面板时的可用高度适配与选中项滚入视野；样式层用显式 `::-webkit-scrollbar` 让滚动条常显占位，并在下拉展开期间放开宿主的 `touch-action`；`main.ts` 把滚轮交还面板。

**Tech Stack:** TypeScript、Obsidian ItemView API、Vitest + happy-dom、esbuild、无头 Edge（Chromium）做几何断言。

**规格：** `docs/superpowers/specs/2026-10-18-topic-switch-scroll-and-root-order-design.md`

**基线与改动前实测：** `npm test` = 25 文件 / 176 用例全绿；无头 Chromium（20 选项、宽 420px）视图高 300px 时面板 bottom 332 > 视图 bottom 302，高 180px 时被裁 150px，`panel.offsetWidth - clientWidth = 2`（无占位滚动条）。

**约定：** 每个任务结束提交一次；提交信息沿用仓库中文前缀风格（`feat:` / `fix:` / `test:` / `refactor:` / `build:` / `chore:`）。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `src/topic-graph.ts` | 根话题筛选（去幽灵）+ `compareRootCodes` 排序；`RootTopicItem` 收敛为 `{ code, title }` |
| `src/dropdown-panel.ts`（新增） | 下拉面板几何：`panelMaxHeight` / `scrollItemIntoView` / `openDropdownPanel` |
| `src/topic-switch.ts` | 「切换zk话题」组件：展开走 `openDropdownPanel`，删除 `disabled`/`is-ghost` 分支 |
| `src/zkno-switch.ts` | 「笔记话题」组件：共用同一面板几何与展开逻辑 |
| `styles.css` | 面板常显滚动条、`overscroll-behavior`、宿主 `zk-show-dropdown-open` 放开 `touch-action` |
| `src/main.ts` | `collectRootTopics` 映射简化；`onWheel` 命中下拉时让位 |
| `test/topic-graph.test.ts` | 根话题筛选/顺序断言 |
| `test/dropdown-panel.test.ts`（新增） | 面板几何纯函数与展开行为断言 |
| `test/topic-switch.test.ts` | 展开设置 `maxHeight`、宿主类开关、全部选项可点击 |
| `scripts/gen-topic-switch-preview.mjs`（新增） | 生成 `preview-topic-switch.html` 供肉眼核对 |

---

### Task 1: 根话题只取真实存在的根，并按编码顺序排序

**Files:**
- Modify: `src/topic-graph.ts:177-194`
- Test: `test/topic-graph.test.ts:99-112`

- [ ] **Step 1: 写失败测试**

把 `test/topic-graph.test.ts` 末尾的 `collectRootTopics` 用例替换为下面三条：

```ts
  it("collectRootTopics 只返回真实存在的根话题，缺号不补、按数值升序", () => {
    const graph = new TopicGraph([
      { path: "root1.md", basename: "数学", no: "1" },
      { path: "root2.md", basename: "编程", no: "2" },
      { path: "root5.md", basename: "写作", no: "5" },
      { path: "root10.md", basename: "第十个话题", no: "10" },
      { path: "child.md", basename: "子卡", no: "2/21" },
    ]);
    const items = collectRootTopics(graph);
    expect(items.map((i) => i.code)).toEqual(["1", "2", "5", "10"]);
    expect(items.map((i) => i.code)).not.toContain("3");
    expect(items.map((i) => i.code)).not.toContain("4");
    expect(items.find((i) => i.code === "5")).toMatchObject({ title: "写作" });
  });

  it("collectRootTopics 不返回没有根 md 的幽灵根", () => {
    const graph = new TopicGraph([{ path: "deep.md", basename: "深处", no: "3/a/1" }]);
    expect(collectRootTopics(graph)).toEqual([]);
  });

  it("collectRootTopics 非数字根排在数字根之后", () => {
    const graph = new TopicGraph([
      { path: "letter.md", basename: "字母根", no: "b" },
      { path: "digit.md", basename: "数字根", no: "2" },
    ]);
    expect(collectRootTopics(graph).map((i) => i.code)).toEqual(["2", "b"]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: FAIL —— 幽灵根用例拿到 `[{ code: "3", title: "3", isGhost: true }]`，缺号用例的 `title` 断言也与实际不符。

- [ ] **Step 3: 实现**

把 `src/topic-graph.ts` 末尾的 `RootTopicItem` 与 `collectRootTopics` 整体替换为：

```ts
export interface RootTopicItem {
  code: string;
  title: string;
}

/**
 * 根话题排序：纯数字根按数值升序且整体排在非数字根之前，其余按本地化数值序，
 * 完全相同再按原始码比较，保证顺序稳定。
 */
export function compareRootCodes(a: string, b: string): number {
  const aIsNumber = /^[0-9]+$/.test(a);
  const bIsNumber = /^[0-9]+$/.test(b);
  if (aIsNumber && bIsNumber) {
    const delta = Number(a) - Number(b);
    return delta !== 0 ? delta : a.localeCompare(b);
  }
  if (aIsNumber !== bIsNumber) return aIsNumber ? -1 : 1;
  const delta = a.localeCompare(b, undefined, { numeric: true });
  return delta !== 0 ? delta : a.localeCompare(b);
}

/**
 * 收集真实存在的根话题（无父节点的顶层编码，且本身有对应的 md 文件），按编码顺序排序。
 * 只遍历图中已有节点：库里是 1、2、5 就只返回这三个，绝不会补出不存在的 3、4；
 * 只有 3/1 而没有 3.md 时，根 3 是幽灵节点，不进入下拉。
 */
export function collectRootTopics(graph: TopicGraph): RootTopicItem[] {
  return graph
    .allNodes()
    .filter((node) => node.parentId === null && !node.isGhost)
    .map((node) => ({ code: node.code, title: node.title }))
    .sort((a, b) => compareRootCodes(a.code, b.code));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: PASS（该文件全部用例）

- [ ] **Step 5: 提交**

```bash
git add src/topic-graph.ts test/topic-graph.test.ts
git commit -m "feat: 根话题只取真实存在的根并按编码顺序排序"
```

---

### Task 2: 新增下拉面板几何模块

**Files:**
- Create: `src/dropdown-panel.ts`
- Test: `test/dropdown-panel.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/dropdown-panel.test.ts`：

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  HOST_OPEN_CLASS,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  openDropdownPanel,
  panelMaxHeight,
  scrollItemIntoView,
} from "../src/dropdown-panel";

function panelWithItem(itemTop: number, itemHeight: number, scrollTop: number, clientHeight: number) {
  const panel = document.createElement("div");
  const item = document.createElement("div");
  panel.appendChild(item);
  Object.defineProperty(panel, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(panel, "clientHeight", { get: () => clientHeight, configurable: true });
  Object.defineProperty(item, "offsetTop", { get: () => itemTop, configurable: true });
  Object.defineProperty(item, "offsetHeight", { get: () => itemHeight, configurable: true });
  return { panel, item };
}

describe("panelMaxHeight", () => {
  it("可用空间充足时取上限", () => {
    expect(panelMaxHeight(900)).toBe(PANEL_MAX_HEIGHT);
    expect(panelMaxHeight(280)).toBe(280);
  });

  it("空间不足时贴合可用空间", () => {
    expect(panelMaxHeight(240.7)).toBe(240);
  });

  it("极矮视图保底", () => {
    expect(panelMaxHeight(20)).toBe(PANEL_MIN_HEIGHT);
    expect(panelMaxHeight(-12)).toBe(PANEL_MIN_HEIGHT);
  });

  it("非有限值回退上限", () => {
    expect(panelMaxHeight(Number.NaN)).toBe(PANEL_MAX_HEIGHT);
    expect(panelMaxHeight(Number.POSITIVE_INFINITY)).toBe(PANEL_MAX_HEIGHT);
  });
});

describe("scrollItemIntoView", () => {
  it("选中项在可视区上方时向上对齐", () => {
    const { panel, item } = panelWithItem(120, 40, 200, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(120);
  });

  it("选中项在可视区下方时向下对齐", () => {
    const { panel, item } = panelWithItem(240, 40, 0, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(180);
  });

  it("选中项已在可视区内时不动", () => {
    const { panel, item } = panelWithItem(140, 40, 100, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(100);
  });
});

describe("openDropdownPanel", () => {
  it("写入 maxHeight、加 is-open、给宿主加放下拉类并滚到选中项", () => {
    const host = document.createElement("div");
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const item = document.createElement("div");
    item.className = "is-selected";
    panel.appendChild(item);
    host.appendChild(anchor);
    host.appendChild(panel);
    openDropdownPanel(panel, anchor, host);
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.style.maxHeight).toBe(`${PANEL_MIN_HEIGHT}px`);
    expect(host.classList.contains(HOST_OPEN_CLASS)).toBe(true);
  });

  it("没有选中项时回到顶部", () => {
    const panel = document.createElement("div");
    Object.defineProperty(panel, "scrollTop", { value: 90, writable: true, configurable: true });
    openDropdownPanel(panel, document.createElement("button"), null);
    expect(panel.scrollTop).toBe(0);
    expect(panel.style.maxHeight).toBe(`${PANEL_MAX_HEIGHT}px`);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/dropdown-panel.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/dropdown-panel"`。

- [ ] **Step 3: 实现**

新建 `src/dropdown-panel.ts`：

```ts
/**
 * 下拉面板几何：面板高度必须落在宿主视图的可用空间内，否则面板会被
 * `.zk-show-root { overflow: hidden }` 裁掉，末尾选项怎么滚都选不到。
 * 这里只做几何与展开，不关心选项内容。
 */

/** 面板高度上限，与 styles.css 中 .zk-show-topic-switch-panel 的 max-height 一致。 */
export const PANEL_MAX_HEIGHT = 280;
/** 视图极矮时的保底高度（约一个半条目）；再矮只能允许面板溢出。 */
export const PANEL_MIN_HEIGHT = 64;
/** 面板与触发按钮之间的间隙，与 styles.css 的 top: calc(100% + 4px) 一致。 */
export const PANEL_GAP = 4;
/** 面板底部与宿主底部之间保留的间距。 */
export const PANEL_MARGIN = 8;
/** 下拉展开期间挂在宿主上的类，用于放开纵向触摸滚动。 */
export const HOST_OPEN_CLASS = "zk-show-dropdown-open";

/** 可用空间充足时取上限，不足时贴合可用空间，极矮视图保底；非有限值回退上限。 */
export function panelMaxHeight(spaceBelow: number): number {
  if (!Number.isFinite(spaceBelow)) return PANEL_MAX_HEIGHT;
  return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, Math.floor(spaceBelow)));
}

/**
 * 把选中项滚入面板可视区。只改面板自身的 scrollTop（offsetTop 相对定位祖先即面板），
 * 不用 scrollIntoView，避免顺带滚动 Obsidian 的视图容器。
 */
export function scrollItemIntoView(panel: HTMLElement, item: HTMLElement): void {
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < panel.scrollTop) {
    panel.scrollTop = top;
    return;
  }
  if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
}

/** 展开面板：按宿主可用空间限制高度 → 显示 → 标记宿主放触摸滚动 → 选中项滚入视野。 */
export function openDropdownPanel(panel: HTMLElement, anchor: HTMLElement, host: HTMLElement | null): void {
  panel.style.maxHeight = `${panelMaxHeight(availableHeightBelow(anchor, host))}px`;
  panel.classList.add("is-open");
  host?.classList.add(HOST_OPEN_CLASS);
  const selected = panel.querySelector<HTMLElement>(".is-selected");
  if (!selected) {
    panel.scrollTop = 0;
    return;
  }
  scrollItemIntoView(panel, selected);
}

/** 面板可用的竖直空间；宿主取不到时返回非有限值，由 panelMaxHeight 回退到上限。 */
function availableHeightBelow(anchor: HTMLElement, host: HTMLElement | null): number {
  if (!host) return Number.POSITIVE_INFINITY;
  const hostRect = host.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  return hostRect.bottom - anchorRect.bottom - PANEL_GAP - PANEL_MARGIN;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/dropdown-panel.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/dropdown-panel.ts test/dropdown-panel.test.ts
git commit -m "feat: 新增下拉面板几何模块（可用高度适配与选中项滚入视野）"
```

---

### Task 3: 「切换zk话题」接入面板几何，删除幽灵选项死代码

**Files:**
- Modify: `src/topic-switch.ts`（全文重构）
- Test: `test/topic-switch.test.ts`

- [ ] **Step 1: 改测试（先失败）**

把 `test/topic-switch.test.ts` 里的 `disabled` 字段全部去掉，并把「幽灵选项置灰且点击不触发选择」用例替换为下面两条：

```ts
  it("选项一律可点击", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "3", title: "3" },
    ]);
    const items = sw.el.querySelectorAll<HTMLElement>(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(sw.el.querySelector(".is-ghost")).toBeNull();
    items[1].click();
    expect(handler).toHaveBeenCalledWith("3");
    sw.destroy();
  });

  it("展开时按可用高度限制面板并标记宿主，收起时解除", () => {
    const host = document.createElement("div");
    host.className = "zk-show-root";
    document.body.appendChild(host);
    const sw = new TopicSwitch();
    host.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "2", title: "编程" },
    ]);
    const trigger = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!;
    trigger.click();
    const panel = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-panel")!;
    expect(panel.style.maxHeight).toBe("64px");
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(true);
    trigger.click();
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(false);
    sw.destroy();
    host.remove();
  });
```

其余用例（渲染、点击回调、外部点击收起、destroy、多次 setOptions）只去掉 `disabled` 字段，断言不变。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/topic-switch.test.ts`
Expected: FAIL —— 类型报错 `disabled` 不存在，且 `panel.style.maxHeight` 为空串。

- [ ] **Step 3: 实现**

`src/topic-switch.ts` 顶部 import 与选项类型：

```ts
import { HOST_OPEN_CLASS, openDropdownPanel } from "./dropdown-panel";

export interface TopicSwitchOption {
  code: string;
  title: string;
}
```

类字段增加宿主记录：

```ts
  private hostEl: HTMLElement | null = null;
```

`close()` / `toggle()` 替换为：

```ts
  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
    this.hostEl?.classList.remove(HOST_OPEN_CLASS);
    this.hostEl = null;
  }

  private toggle(): void {
    if (this.panel.classList.contains("is-open")) {
      this.close();
      return;
    }
    // 面板绝对定位在视图根内：offsetParent 即宿主（.zk-show-root），用它算可用高度
    this.hostEl = (this.el.offsetParent as HTMLElement | null) ?? this.el.parentElement;
    openDropdownPanel(this.panel, this.button, this.hostEl);
    this.button.setAttribute("aria-expanded", "true");
  }
```

`render()` 循环删除幽灵分支后为：

```ts
    for (const option of this.options) {
      const item = document.createElement("div");
      item.className = "zk-show-topic-switch-item";
      item.setAttribute("role", "option");
      if (option.code === this.selectedCode) item.classList.add("is-selected");
      const code = document.createElement("span");
      code.className = "zk-show-topic-switch-code";
      code.textContent = option.code;
      const title = document.createElement("span");
      title.className = "zk-show-topic-switch-title";
      title.textContent = option.title;
      item.appendChild(code);
      item.appendChild(title);
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => {
        this.selectedCode = option.code;
        this.selectHandler(option.code);
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/topic-switch.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/topic-switch.ts test/topic-switch.test.ts
git commit -m "feat: 切换zk话题下拉按视图可用高度限制高度并移除幽灵选项分支"
```

---

### Task 4: 「笔记话题」共用同一套面板几何

**Files:**
- Modify: `src/zkno-switch.ts`
- Test: `test/zkno-switch.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/zkno-switch.test.ts` 追加（文件首行若缺 `// @vitest-environment happy-dom` 需补上）：

```ts
describe("ZkNoSwitch 面板几何", () => {
  it("展开时限制高度并标记宿主，收起时解除", () => {
    const host = document.createElement("div");
    host.className = "zk-show-root";
    document.body.appendChild(host);
    const sw = new ZkNoSwitch();
    host.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/11a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/2a" },
      ],
      "1/11a"
    );
    const trigger = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!;
    trigger.click();
    const panel = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-panel")!;
    expect(panel.style.maxHeight).toBe("64px");
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(true);
    trigger.click();
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(false);
    sw.destroy();
    host.remove();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: FAIL —— `panel.style.maxHeight` 为空串、宿主类未加。

- [ ] **Step 3: 实现**

`src/zkno-switch.ts` 顶部加：

```ts
import { HOST_OPEN_CLASS, openDropdownPanel } from "./dropdown-panel";
```

类字段增加：

```ts
  private hostEl: HTMLElement | null = null;
```

`close()` 与 `toggle()` 替换为：

```ts
  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
    this.hostEl?.classList.remove(HOST_OPEN_CLASS);
    this.hostEl = null;
  }

  private toggle(): void {
    if (this.panel.classList.contains("is-open")) {
      this.close();
      return;
    }
    // 与 TopicSwitch 一致：面板定位在视图根内，offsetParent 即宿主
    this.hostEl = (this.el.offsetParent as HTMLElement | null) ?? this.el.parentElement;
    openDropdownPanel(this.panel, this.button, this.hostEl);
    this.button.setAttribute("aria-expanded", "true");
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/zkno-switch.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/zkno-switch.ts test/zkno-switch.test.ts
git commit -m "feat: 笔记话题下拉共用面板高度适配"
```

---

### Task 5: 样式——常显滚动条与触摸滚动

**Files:**
- Modify: `styles.css:845-890`

- [ ] **Step 1: 改样式**

`.zk-show-topic-switch-panel` 规则内，在 `overflow-y: auto;` 之后追加一行：

```css
  overscroll-behavior: contain;
```

在 `.zk-show-topic-switch-panel.is-open` 之前插入：

```css
/* 显式样式化滚动条：Chromium 会改用占位的经典滚动条，不再受系统 overlay 设置影响。
   不用 scrollbar-width/scrollbar-color，标准属性会让 ::-webkit-scrollbar 失效。 */
.zk-show-root .zk-show-topic-switch-panel::-webkit-scrollbar {
  width: 10px;
}

.zk-show-root .zk-show-topic-switch-panel::-webkit-scrollbar-track {
  background: transparent;
}

.zk-show-root .zk-show-topic-switch-panel::-webkit-scrollbar-thumb {
  background: var(--background-modifier-border-hover);
  border: 2px solid transparent;
  border-radius: 5px;
  background-clip: content-box;
}

/* touch-action 取祖先链交集，下拉展开期间放开宿主的纵向平移，触摸才能滚动列表 */
.zk-show-root.zk-show-dropdown-open {
  touch-action: pan-y;
}
```

同时删除这两条死规则：

```css
.zk-show-topic-switch-item.is-ghost { ... }
.zk-show-topic-switch-item.is-ghost:hover { ... }
```

- [ ] **Step 2: 校验样式文件自洽**

Run: `node -e "const c=require('fs').readFileSync('styles.css','utf8'); console.log('braces', (c.match(/{/g)||[]).length, (c.match(/}/g)||[]).length); console.log('is-ghost 残留', c.includes('is-ghost'))"`
Expected: 两个括号数相等；`is-ghost 残留 false`

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "style: 下拉面板常显滚动条并在展开期间放开触摸滚动"
```

---

### Task 6: 主视图接线——选项映射简化与滚轮让位

**Files:**
- Modify: `src/main.ts:464-478`（`onWheel`）、`src/main.ts:1046-1052`（`setOptions`）

- [ ] **Step 1: 改 `onWheel`**

在 `private onWheel = (ev: WheelEvent): void => {` 之后、`if (!ev.ctrlKey)` 之前插入：

```ts
    // 下拉面板内的滚轮交还面板原生滚动，Ctrl+滚轮也不在面板上缩放画布
    if (isElementNode(ev.target) && ev.target.closest(".zk-show-topic-switch, .zk-show-zkno-switch")) return;
```

- [ ] **Step 2: 改选项映射**

`this.topicSwitch.setOptions(...)` 调用替换为：

```ts
    this.topicSwitch.setOptions(collectRootTopics(this.plugin.index));
```

（`collectRootTopics` 现在返回 `{ code, title }`，与 `TopicSwitchOption` 同形。）

- [ ] **Step 3: 类型与测试校验**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出（无类型错误）

Run: `npx vitest run test/topic-switch.test.ts test/topic-graph.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/main.ts
git commit -m "feat: 下拉区域内滚轮让位给面板滚动"
```

---

### Task 7: 无头 Edge 几何断言 + 预览页

**Files:**
- Create: `scripts/gen-topic-switch-preview.mjs`
- Create（生成物）: `preview-topic-switch.html`

- [ ] **Step 1: 写生成脚本**

新建 `scripts/gen-topic-switch-preview.mjs`（与既有 `scripts/gen-preview.mjs` 同风格：esbuild 打包真实组件，把产物与真实 `styles.css` 一起内联进 HTML）：

```js
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
```

- [ ] **Step 2: 生成预览页**

Run: `node scripts/gen-topic-switch-preview.mjs`
Expected: 输出 `已生成 ...preview-topic-switch.html`；仓库根目录出现 `preview-topic-switch.html`；`.preview-switch-tmp.*` 已清理（`git status --short` 不出现）

- [ ] **Step 3: 无头 Edge 断言几何**

Edge headless 会复用已有浏览器实例导致取不到 DOM，必须给独立 `--user-data-dir`：

```powershell
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
& $edge --headless=new --disable-gpu --no-first-run --user-data-dir="$env:TEMP\zk-switch-probe" `
  --window-size=700,2600 --dump-dom "file:///E:/dev/zk-show/preview-topic-switch.html" 2>&1 |
  Select-String -Pattern '视图高度=|面板 client=|面板 bottom=|最后一项可见=|滚动条占位='
```

Expected（四组；改动前基线是 300px 组 `面板 bottom=332 视图 bottom=302`、`滚动条占位=2px`）：

- `视图高度=900 选项数=4` → `最后一项可见=true`、`滚动条占位=2px`（内容不超高，不需要滚动条）
- `视图高度=900 选项数=20` → `面板 bottom ≤ 视图 bottom - 10`、`最后一项可见=true`、`滚动条占位=12px`
- `视图高度=300 选项数=20` → `面板 bottom=290 左右 ≤ 视图 bottom=302`、`最后一项可见=true`、`滚动条占位=12px`
- `视图高度=180 选项数=20` → `面板 bottom=170 左右 ≤ 视图 bottom=182`、`最后一项可见=true`、`滚动条占位=12px`

- [ ] **Step 4: 提交**

```bash
git add scripts/gen-topic-switch-preview.mjs preview-topic-switch.html
git commit -m "chore: 纳入切换zk话题下拉的滚动核对预览页"
```

---

### Task 8: 全量回归、构建与同步到 vault

**Files:**
- Modify: `main.js`（esbuild 产物）

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部测试文件通过（新增 `test/dropdown-panel.test.ts` 后为 26 个文件）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 无报错，`main.js` 更新

- [ ] **Step 3: 同步到 vault（先备份）**

```powershell
$repo = 'E:\dev\zk-show'
$inst = 'C:\Users\cc\7adiu-d2vq6\技术和学习记录\.obsidian\plugins\zk-show'
Copy-Item "$inst\main.js" "$inst\main.js.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item "$inst\styles.css" "$inst\styles.css.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item "$repo\main.js" "$inst\main.js" -Force
Copy-Item "$repo\styles.css" "$inst\styles.css" -Force
Get-ChildItem $inst | Select-Object Name, Length, LastWriteTime
```

Expected: `main.js` / `styles.css` 与仓库版本字节数一致，并出现新的 `.bak-*` 备份

- [ ] **Step 4: 提交构建产物**

```bash
git add main.js
git commit -m "build: 重建 main.js"
```

---

## 验收清单（对照规格）

- [ ] 面板高度 = `min(280, 视图可用高度 - 8)`，不低于 64px（Task 2/3/4/5 + Task 7 断言）
- [ ] 滚动条常显占位（Task 5 + Task 7 的 `滚动条占位=12px`）
- [ ] 滚到底后末尾选项在视图内可见（Task 7）
- [ ] 根话题按数值升序，非数字根在后（Task 1）
- [ ] 缺号不补、幽灵根不显示（Task 1）
- [ ] 下拉内滚轮/Ctrl+滚轮不缩放画布（Task 6）
- [ ] 全量测试与构建通过（Task 8）
