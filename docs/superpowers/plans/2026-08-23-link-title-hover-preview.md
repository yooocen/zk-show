# 入链出链标题 Ctrl 悬停预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让入链/出链弹窗中的已解析笔记标题在按住 Ctrl 的鼠标悬停时调用 Obsidian 原生 Page Preview。

**Architecture:** 新增一个纯逻辑判定函数，集中定义“鼠标 + Ctrl”触发条件并用单元测试锁定行为。`ZkShowPlugin` 注册 `zk-show` hover-link 来源，`ZkShowView` 将已解析标题元素绑定到原生 `workspace.trigger("hover-link", ...)`，由 Obsidian 负责预览窗口的渲染、定位与生命周期。

**Tech Stack:** TypeScript、Obsidian API、Vitest、esbuild。

---

### Task 1: 添加 Ctrl 鼠标触发条件的回归测试

**Files:**
- Create: `src/hover-link.ts`
- Create: `test/hover-link.test.ts`

- [ ] **Step 1: 写出触发条件测试**

创建 `test/hover-link.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { shouldPreviewLinkOnPointer } from "../src/hover-link";

describe("链接标题预览触发条件", () => {
  it("只接受按住 Ctrl 的鼠标指针", () => {
    expect(shouldPreviewLinkOnPointer({ pointerType: "mouse", ctrlKey: true })).toBe(true);
    expect(shouldPreviewLinkOnPointer({ pointerType: "mouse", ctrlKey: false })).toBe(false);
    expect(shouldPreviewLinkOnPointer({ pointerType: "touch", ctrlKey: true })).toBe(false);
    expect(shouldPreviewLinkOnPointer({ pointerType: "pen", ctrlKey: true })).toBe(false);
  });
});
```

此时先不创建 `src/hover-link.ts`，让测试明确表达待实现的接口。

- [ ] **Step 2: 运行测试确认当前实现失败**

运行：`npm test -- test/hover-link.test.ts`

预期：测试因 `../src/hover-link` 模块尚未存在而失败。

- [ ] **Step 3: 实现最小触发判定函数**

创建 `src/hover-link.ts`：

```ts
export function shouldPreviewLinkOnPointer(event: Pick<PointerEvent, "pointerType" | "ctrlKey">): boolean {
  return event.pointerType === "mouse" && event.ctrlKey;
}
```

- [ ] **Step 4: 运行测试确认通过**

运行：`npm test -- test/hover-link.test.ts`

预期：测试通过，覆盖鼠标 Ctrl、普通鼠标、触摸和触控笔四种组合。

### Task 2: 注册 Obsidian 原生 hover-link 来源

**Files:**
- Modify: `src/main.ts:1-45`

- [ ] **Step 1: 扩展 Obsidian 导入并注册来源**

将导入改为包含类型 `HoverPopover`：

```ts
import { ItemView, Plugin, TFile, WorkspaceLeaf, type HoverPopover } from "obsidian";
```

在 `ZkShowPlugin.onload()` 的初始化区域注册：

```ts
this.registerHoverLinkSource("zk-show", {
  display: "ZK Show 卡片关系图",
  defaultMod: true,
});
```

这样 `workspace.trigger("hover-link", ...)` 会被 Page Preview 核心插件识别为 `zk-show` 来源。

### Task 3: 将已解析入链/出链标题接入预览事件

**Files:**
- Modify: `src/main.ts:1-110, 462-535`

- [ ] **Step 1: 添加视图状态和标题绑定辅助函数**

在 `ZkShowView` 字段中加入：

```ts
public hoverPopover: HoverPopover | null = null;
private linkPreviewTarget: HTMLElement | null = null;
private linkPreviewPath: string | null = null;
```

在 `openLinkPopover` 前加入辅助函数：

```ts
private bindLinkTitlePreview(titleEl: HTMLElement, path: string): void {
  const trigger = (ev: PointerEvent): void => {
    if (!shouldPreviewLinkOnPointer(ev)) return;
    if (this.linkPreviewTarget === titleEl && this.linkPreviewPath === path) return;
    this.linkPreviewTarget = titleEl;
    this.linkPreviewPath = path;
    this.app.workspace.trigger("hover-link", {
      event: ev,
      source: "zk-show",
      hoverParent: this,
      targetEl: titleEl,
      linktext: path,
      sourcePath: this.app.workspace.getActiveFile()?.path ?? "",
    });
  };
  titleEl.addEventListener("pointerover", trigger);
  titleEl.addEventListener("pointermove", trigger);
  titleEl.addEventListener("pointerout", () => {
    if (this.linkPreviewTarget === titleEl) {
      this.linkPreviewTarget = null;
      this.linkPreviewPath = null;
    }
  });
}
```

在 `onClose()` 中清理 `linkPreviewTarget`、`linkPreviewPath` 和 `hoverPopover`。

- [ ] **Step 2: 为出链和入链标题绑定目标路径**

出链循环中改为保存标题元素并绑定已解析路径：

```ts
const title = item.createSpan({ cls: "zk-show-link-item-label", text: link.label });
if (resolved) {
  this.bindLinkTitlePreview(title, link.path!);
  // 保留现有 role、pointerdown、keydown 处理
}
```

入链循环中使用 `backlink.path`：

```ts
const title = item.createSpan({ cls: "zk-show-link-item-label", text: backlink.label });
if (backlink.path) {
  this.bindLinkTitlePreview(title, backlink.path);
  // 保留现有 role、pointerdown、keydown 处理
}
```

未解析出链不绑定辅助函数，点击打开和键盘导航代码保持不变。

### Task 4: 完整验证和构建

**Files:**
- Verify: `src/hover-link.ts`
- Verify: `src/main.ts`
- Verify: `test/hover-link.test.ts`

- [ ] **Step 1: 运行新增测试和完整测试**

运行：`npm test -- test/hover-link.test.ts`，再运行：`npm test`

预期：新增测试通过；完整测试全部通过，现有链接弹窗和导航回归不受影响。

- [ ] **Step 2: 运行生产构建**

运行：`npm run build`

预期：TypeScript 和 esbuild 构建成功，输出更新后的 `main.js`。

- [ ] **Step 3: 检查关键差异**

运行：`rg -n -C 3 "registerHoverLinkSource|bindLinkTitlePreview|hover-link|shouldPreviewLinkOnPointer" src/main.ts src/hover-link.ts test/hover-link.test.ts`

预期：来源注册、事件绑定、原生触发和四类触发条件测试均存在，未解析条目没有绑定预览。
