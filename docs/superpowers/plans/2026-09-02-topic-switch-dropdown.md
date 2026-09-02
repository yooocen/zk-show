# 切换 zk 话题下拉菜单 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ZK Show 展示窗口右上角新增固定「切换zk话题」下拉菜单，可选根话题并跳转到对应根话题 md 文件。

**Architecture:** 复用 `.zk-show-combo-*` 视觉风格新建 `TopicSwitch` 组件（独立文件），作为 `zk-show-root` 的平级子元素绝对定位右上角，因此天然不受画布 `translate/scale` 变换影响。根话题通过 `TopicGraph` 新增纯函数 `collectRootTopics()` 收集。

**Tech Stack:** TypeScript、Obsidian API、esbuild、Vitest。

---

## 文件结构

- **新增** `src/topic-switch.ts`：`TopicSwitch` 组件类（触发按钮 + 下拉面板），依赖 DOM，无 Obsidian API 依赖，便于复用与测试。
- **新增** `test/topic-switch.test.ts`：组件渲染/交互单元测试。
- **修改** `src/topic-graph.ts`：新增 `RootTopicItem` 接口与 `collectRootTopics()` 纯函数。
- **修改** `test/topic-graph.test.ts`：新增 `collectRootTopics()` 测试。
- **修改** `src/main.ts`：在 `onOpen()` 创建组件、`refresh()` 同步重建、pointer 事件忽略 `.zk-show-topic-switch`、选中回调走 `navigateToCode`。
- **修改** `styles.css`：新增 `.zk-show-topic-switch` 相关样式（复用 `.zk-show-combo-*` 观感）。

---

### Task 1: `collectRootTopics()` 纯函数 + 测试

**Files:**
- Modify: `src/topic-graph.ts`（文件末尾追加）
- Test: `test/topic-graph.test.ts`

- [ ] **Step 1: 在 `test/topic-graph.test.ts` 末尾追加测试**

在 `describe("TopicGraph", ...)` 的最后一个 `it` 之后（第 72 行 `});` 前）插入：

```ts
  it("collectRootTopics 返回全部根话题及标题/幽灵标记", () => {
    const graph = new TopicGraph([
      { path: "root1.md", basename: "数学", no: "1" },
      { path: "child1.md", basename: "子卡", no: "1/41" },
      { path: "root2.md", basename: "编程", no: "2" },
      { path: "deep.md", basename: "深处", no: "3/a/1" },
    ]);
    const items = collectRootTopics(graph);
    expect(items.map((i) => i.code)).toEqual(["1", "2", "3"]);
    expect(items.find((i) => i.code === "1")).toMatchObject({ title: "数学", isGhost: false });
    expect(items.find((i) => i.code === "2")).toMatchObject({ title: "编程", isGhost: false });
    // 根 3 只有真实子级 3/a/1，根节点本身是幽灵
    expect(items.find((i) => i.code === "3")).toMatchObject({ title: "3", isGhost: true });
  });
```

- [ ] **Step 2: 更新 `test/topic-graph.test.ts` 顶部 import**

把第 2 行：

```ts
import { TopicGraph } from "../src/topic-graph";
```

改为：

```ts
import { collectRootTopics, TopicGraph } from "../src/topic-graph";
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: FAIL，报错 `collectRootTopics is not defined`（还未导出）。

- [ ] **Step 4: 在 `src/topic-graph.ts` 末尾追加实现**

在文件末尾（第 174 行 `}` 之后）追加：

```ts
export interface RootTopicItem {
  code: string;
  title: string;
  isGhost: boolean;
}

/** 收集所有根话题（无父节点的顶层编码），按数字/字典序排序。 */
export function collectRootTopics(graph: TopicGraph): RootTopicItem[] {
  const roots = graph
    .allNodes()
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((node) => ({
      code: node.code,
      title: node.isGhost ? node.code : node.title,
      isGhost: node.isGhost,
    }));
  return roots;
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: PASS，7 个用例。

- [ ] **Step 6: 提交**

```bash
git add src/topic-graph.ts test/topic-graph.test.ts
git commit -m "feat: TopicGraph.collectRootTopics 收集根话题"
```

---

### Task 2: `TopicSwitch` 组件 + 测试

**Files:**
- Create: `src/topic-switch.ts`
- Test: `test/topic-switch.test.ts`

- [ ] **Step 1: 创建 `src/topic-switch.ts`**

```ts
export interface TopicSwitchOption {
  code: string;
  title: string;
  disabled: boolean;
}

/**
 * 右上角「切换zk话题」下拉。作为视图根容器之外的平级元素绝对定位，
 * 不参与画布 translate/scale 变换，位置固定、不支持缩放。
 */
export class TopicSwitch {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private options: TopicSwitchOption[] = [];
  private selectedCode: string | null = null;
  private selectHandler: (code: string) => void = () => {};
  private pointerDownHandler: (ev: PointerEvent) => void = () => {};

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "zk-show-topic-switch";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "zk-show-topic-switch-trigger";
    this.button.textContent = "切换zk话题";
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

    // 阻止事件冒泡到视图根容器，避免触发画布拖拽/缩放/导航
    this.pointerDownHandler = (ev) => ev.stopPropagation();
    this.el.addEventListener("pointerdown", this.pointerDownHandler);
  }

  setOptions(options: TopicSwitchOption[]): void {
    this.options = options;
    this.render();
  }

  setSelected(code: string | null): void {
    this.selectedCode = code;
    this.render();
  }

  onChange(handler: (code: string) => void): void {
    this.selectHandler = handler;
  }

  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
  }

  private toggle(): void {
    const isOpen = this.panel.classList.toggle("is-open");
    this.button.setAttribute("aria-expanded", String(isOpen));
  }

  private render(): void {
    this.panel.innerHTML = "";
    for (const option of this.options) {
      const item = document.createElement("div");
      item.className = "zk-show-topic-switch-item";
      item.setAttribute("role", "option");
      if (option.code === this.selectedCode) item.classList.add("is-selected");
      if (option.disabled) {
        item.classList.add("is-ghost");
        item.setAttribute("aria-disabled", "true");
      }
      const code = document.createElement("span");
      code.className = "zk-show-topic-switch-code";
      code.textContent = option.code;
      const title = document.createElement("span");
      title.className = "zk-show-topic-switch-title";
      title.textContent = option.title;
      item.appendChild(code);
      item.appendChild(title);
      if (!option.disabled) {
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
      }
      this.panel.appendChild(item);
    }
  }

  destroy(): void {
    this.el.removeEventListener("pointerdown", this.pointerDownHandler);
    this.el.remove();
  }
}
```

- [ ] **Step 2: 创建 `test/topic-switch.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { TopicSwitch } from "../src/topic-switch";

describe("TopicSwitch", () => {
  it("渲染所有选项，包含编码与标题", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学", disabled: false },
      { code: "2", title: "编程", disabled: false },
    ]);
    const items = sw.el.querySelectorAll(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-topic-switch-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-topic-switch-title")?.textContent).toBe("数学");
    sw.destroy();
  });

  it("幽灵选项置灰且点击不触发选择", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学", disabled: false },
      { code: "3", title: "3", disabled: true },
    ]);
    const ghost = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item.is-ghost")!;
    expect(ghost).toBeTruthy();
    ghost.click();
    expect(handler).not.toHaveBeenCalled();
    sw.destroy();
  });

  it("点击可用选项回调并关闭面板", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "2", title: "编程", disabled: false }]);
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item")!.click();
    expect(handler).toHaveBeenCalledWith("2");
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });
});
```

- [ ] **Step 3: 运行测试，确认通过**

Run: `npx vitest run test/topic-switch.test.ts`
Expected: PASS，3 个用例。

- [ ] **Step 4: 提交**

```bash
git add src/topic-switch.ts test/topic-switch.test.ts
git commit -m "feat: TopicSwitch 右上角根话题下拉组件"
```

---

### Task 3: 接入 `ZkShowView`（创建/重建/回调/事件忽略）

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: 新增 import**

把第 9 行：

```ts
import { ZkNoFormModal } from "./zkno-form-modal";
```

后面追加：

```ts
import { collectRootTopics } from "./topic-graph";
import { TopicSwitch } from "./topic-switch";
```

- [ ] **Step 2: 新增字段**

在第 98 行 `private canvasEl!: HTMLElement;` 之后追加：

```ts
  private topicSwitch: TopicSwitch | null = null;
```

- [ ] **Step 3: `onOpen()` 中创建组件**

把 `onOpen()`（第 156 行 `this.rootEl = ...` 之前，即方法开头）改为：

```ts
  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "zk-show-root" });
    this.topicSwitch = new TopicSwitch();
    this.topicSwitch.el.classList.add("zk-show-root");
    this.topicSwitch.onChange((code) => {
      const node = this.plugin.index.node(code);
      this.navigateToCode(code, node?.path ?? null);
    });
    this.rootEl.appendChild(this.topicSwitch.el);
```

（后续事件监听与 `this.refresh()` 保持不变。）

- [ ] **Step 4: `onClose()` 中销毁组件**

把 `onClose()` 中 `this.rootEl?.remove();`（第 186 行）改为：

```ts
    this.topicSwitch?.destroy();
    this.topicSwitch = null;
    this.rootEl?.remove();
```

- [ ] **Step 5: pointer 事件忽略 `.zk-show-topic-switch`**

三处忽略列表追加选择器（现有两处 `".zk-show-hint-popover, .zk-show-link-popover"` 的写法）：

- `onPointerDown`（第 268 行）改为：

```ts
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
```

- `onPointerMove`（第 286 行）改为：

```ts
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
```

- `onPointerEnd`（第 327 行）改为：

```ts
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
```

- [ ] **Step 6: `refresh()` 中重建组件**

`root.empty()` 清空了根容器，需要在 `refresh()` 中重建 TopicSwitch。

**A. 在 `root.empty()` 之后、`this.canvasEl = canvas;` 之前创建 TopicSwitch 并挂载**（约第 768 行）：

```ts
    this.topicSwitch = new TopicSwitch();
    this.topicSwitch.el.classList.add("zk-show-root");
    this.topicSwitch.onChange((code) => {
      const node = this.plugin.index.node(code);
      this.navigateToCode(code, node?.path ?? null);
    });
    this.topicSwitch.setOptions(
      collectRootTopics(this.plugin.index).map((item) => ({
        code: item.code,
        title: item.title,
        disabled: item.isGhost,
      }))
    );
    root.appendChild(this.topicSwitch.el);
```

**B. 在 `const code = ...` 解析之后**（第 781 行之后，`if (!pinned)` 之前或之后均可），设置选中项：

```ts
    this.topicSwitch.setSelected(
      code !== null && !this.plugin.index.node(code)?.isGhost ? code : null
    );
```

- [ ] **Step 7: 编译检查**

Run: `npx tsc --noEmit 2>&1 | Select-String "src/main.ts"`
Expected: 无输出（src/main.ts 无类型错误；test/index-fingerprint.test.ts 的既有错误与本任务无关）。

- [ ] **Step 8: 运行全部测试**

Run: `npx vitest run`
Expected: 全部通过（原 120 + 新增 4 = 124，含 topic-graph 新增 1 与 topic-switch 3）。

- [ ] **Step 9: 提交**

```bash
git add src/main.ts
git commit -m "feat: 接入右上角切换 zk 话题下拉"
```

---

### Task 4: 样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 `styles.css` 末尾追加样式**

```css
/* ===== 右上角切换 zk 话题下拉 ===== */
.zk-show-topic-switch {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 40;
  font-family: var(--font-interface);
}

.zk-show-topic-switch-trigger {
  padding: 5px 10px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.zk-show-topic-switch-trigger:hover {
  border-color: var(--background-modifier-border-hover);
}

.zk-show-topic-switch-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--background-modifier-accent);
}

.zk-show-topic-switch-panel {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  max-width: min(320px, calc(100vw - 16px));
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  z-index: 50;
}

.zk-show-topic-switch-panel.is-open {
  display: block;
}

.zk-show-topic-switch-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.zk-show-topic-switch-item:hover {
  background: var(--background-secondary);
}

.zk-show-topic-switch-item.is-selected {
  background: var(--background-modifier-accent);
}

.zk-show-topic-switch-item.is-ghost {
  cursor: default;
  opacity: 0.5;
}

.zk-show-topic-switch-item.is-ghost:hover {
  background: transparent;
}

.zk-show-topic-switch-code {
  font-family: var(--font-monospace);
  font-weight: 600;
  color: var(--text-normal);
  flex: 0 0 auto;
}

.zk-show-topic-switch-title {
  color: var(--text-muted);
  font-size: 12px;
  min-width: 0;
  word-break: break-word;
}
```

- [ ] **Step 2: 提交**

```bash
git add styles.css
git commit -m "style: 切换 zk 话题下拉样式"
```

---

### Task 5: 构建并同步到 Obsidian 库

- [ ] **Step 1: 构建**

Run: `npx node esbuild.config.mjs production`
Expected: 输出 `main.js  60.x kb`，无报错。

- [ ] **Step 2: 同步插件文件**

Run（PowerShell）：

```powershell
$target = "C:\Users\cc\7adiu-d2vq6\技术和学习记录\.obsidian\plugins\zk-show"
Copy-Item -Path "main.js","manifest.json","styles.css" -Destination $target -Force
```

Expected: 三个文件复制成功。

- [ ] **Step 3: 完成确认**

Run: `git status --short`
Expected: 只剩 `main.js` 的修改（源码已提交）。向用户说明：在 Obsidian 重新加载插件后生效。
