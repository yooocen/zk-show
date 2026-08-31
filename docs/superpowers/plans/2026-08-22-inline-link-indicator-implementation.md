# 正文双链绿色标记与关联列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在关系图卡片左上角显示正文双链绿色圆点，并通过弹出层查看和打开直接关联笔记。

**Architecture:** 新增纯函数链接数据模块，插件入口从 metadata cache 提取并解析出链；链接数据随 `ZRecord → TopicGraphNode → ProjectionCard → Layout` 传递。渲染层只输出标记，视图层负责弹出层、键盘交互和打开目标文件。

**Tech Stack:** TypeScript、Obsidian API、Vitest、现有 DOM/SVG 渲染和 CSS 主题变量。

---

### Task 1: 链接数据边界与失败测试

**Files:**
- Create: `src/inline-links.ts`
- Create: `test/inline-links.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { extractInlineLinks, type InlineLinkCacheEntry } from "../src/inline-links";

describe("extractInlineLinks", () => {
  it("保留普通链接、别名和未解析目标", () => {
    const entries: InlineLinkCacheEntry[] = [
      { link: "目标笔记", displayText: "目标笔记" },
      { link: "已存在", displayText: "友好名称" },
      { link: "待创建", displayText: "待创建" },
    ];
    const result = extractInlineLinks(entries, (link) =>
      link === "已存在" ? { path: "已存在.md", title: "已存在" } : null
    );

    expect(result).toEqual([
      { link: "目标笔记", label: "目标笔记", path: null, title: "目标笔记" },
      { link: "已存在", label: "友好名称", path: "已存在.md", title: "已存在" },
      { link: "待创建", label: "待创建", path: null, title: "待创建" },
    ]);
  });

  it("删除重复链接并忽略空链接", () => {
    expect(extractInlineLinks([
      { link: "A", displayText: "A" },
      { link: "A", displayText: "另一个名字" },
      { link: "", displayText: "" },
    ], () => null)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/inline-links.test.ts`

Expected: FAIL because `src/inline-links.ts` and `extractInlineLinks` do not exist.

- [ ] **Step 3: Write minimal implementation**

Define `InlineLink` with `link`, `label`, `path`, and `title`; define `InlineLinkCacheEntry`; implement ordered de-duplication by trimmed link target, preserve the first display label, call the resolver for each target, and use the target text as fallback title.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/inline-links.test.ts`

Expected: PASS with 2 tests.

### Task 2: 让链接数据进入图模型与布局卡片

**Files:**
- Modify: `src/topic-graph.ts`
- Modify: `src/focus-projection.ts`
- Modify: `src/layout/geometry.ts`
- Modify: `src/layout/compiler.ts`
- Modify: `src/renderer.ts`
- Create: `test/inline-link-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";
import { layoutView } from "../src/renderer";

it("把正文双链从记录传递到当前布局卡片", () => {
  const index = new ThreadIndex([
    { path: "a.md", basename: "A", no: "1", links: [
      { link: "B", label: "B", path: "b.md", title: "B" },
    ] },
    { path: "b.md", basename: "B", no: "1/1", links: [] },
  ]);

  const layout = layoutView(computeView(index, "1")!);
  expect(layout.cards.find((card) => card.code === "1")?.links).toEqual([
    { link: "B", label: "B", path: "b.md", title: "B" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/inline-link-model.test.ts`

Expected: FAIL because `ZRecord`, graph nodes, projection cards, and placed cards do not expose `links`.

- [ ] **Step 3: Write minimal implementation**

Add `links: InlineLink[]` to `ZRecord`, `TopicGraphNode`, `ProjectionCard`, and `PlacedCard`; default ghost and legacy records to `[]`; copy links in `toCard`; pass `card.hasLinks` into `measureCard` and add a small width allowance so the indicator does not overlap title text.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/inline-link-model.test.ts`

Expected: PASS with the existing layout assertions still passing.

### Task 3: 从 metadata cache 提取正文双链

**Files:**
- Modify: `src/main.ts`
- Modify: `src/inline-links.ts`
- Create: `test/scan-links.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { scanInlineLinks } from "../src/inline-links";

it("把 metadata cache 出链解析成可渲染数据", () => {
  const result = scanInlineLinks(
    [
      { link: "目标", displayText: "目标" },
      { link: "别名目标", displayText: "显示名称" },
    ],
    "来源.md",
    (link, source) => link === "目标" && source === "来源.md"
      ? { path: "目标.md", basename: "目标" }
      : null,
  );

  expect(result).toMatchObject([
    { link: "目标", label: "目标", path: "目标.md", title: "目标" },
    { link: "别名目标", label: "显示名称", path: null, title: "别名目标" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/scan-links.test.ts`

Expected: FAIL because `scanInlineLinks` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement `scanInlineLinks` as a thin adapter over `extractInlineLinks`, passing `sourcePath` to the resolver. In `ZkShowPlugin.scan`, read `cache.links ?? []`, resolve each link through `this.app.metadataCache.getFirstLinkpathDest(entry.link, file.path)`, and include the resulting links in each `ZRecord`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/scan-links.test.ts`

Expected: PASS.

### Task 4: 渲染绿色圆点并添加样式

**Files:**
- Modify: `src/renderer.ts`
- Modify: `styles.css`
- Create: `test/link-indicator-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { linkIndicatorLabel, hasInlineLinks } from "../src/inline-links";

it("仅在有正文双链时显示标记并生成数量提示", () => {
  const links = [{ link: "B", label: "B", path: "b.md", title: "B" }];
  expect(hasInlineLinks(links)).toBe(true);
  expect(linkIndicatorLabel("A", links)).toBe("显示 A 的正文双链（1）");
  expect(hasInlineLinks([])).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/link-indicator-state.test.ts`

Expected: FAIL because the indicator helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

Add `hasInlineLinks` and `linkIndicatorLabel`; in `renderLayout`, add `has-links` to linked cards and prepend a button with class `zk-show-link-indicator`, `data-link-indicator`, `data-code`, `aria-label`, and a visually hidden count-free label. Add CSS for a green 9px circle at the card top-left, focus/hover ring, current-card contrast, and extra card left padding.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/link-indicator-state.test.ts`

Expected: PASS; run `npm test -- test/renderer.test.ts` to ensure layout behavior remains green.

### Task 5: 实现关联列表弹出层与交互

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`
- Modify: `test/hidden-hint-popover.test.ts`

- [ ] **Step 1: Write the failing test**

Add pure state assertions for toggling link popovers and reuse `popoverPosition` for marker placement:

```ts
it("切换正文双链弹出层", () => {
  expect(toggleLink(null, "1")).toBe("1");
  expect(toggleLink("1", "1")).toBeNull();
  expect(toggleLink("1", "2")).toBe("2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/hidden-hint-popover.test.ts`

Expected: FAIL because `toggleLink` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add the pure toggle helper. In `ZkShowView`, track `openLinkCode`, `linkPopoverEl`, and `linkIndicatorEl`; recognize `.zk-show-link-indicator` before card navigation; support Enter/Space and Escape; close the link popover when panning, zooming, refreshing, or clicking elsewhere. Render `.zk-show-link-popover` with each `InlineLink`; resolved items open the file with `workspace.getLeaf(false).openFile`, unresolved items use `aria-disabled`. Stop pointer propagation inside the popover and position it with `popoverPosition` using the indicator's card-local coordinates transformed by the current viewport.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/hidden-hint-popover.test.ts`

Expected: PASS.

### Task 6: 全量验证与生产构建

**Files:**
- Modify: `main.js` via the existing build script (generated bundle)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: Vitest exits 0 with all test files passing.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: esbuild exits 0 and regenerates `main.js` without TypeScript errors.

- [ ] **Step 3: Inspect the final diff and generated bundle**

Run: `git -c safe.directory='C:/Users/cc/7adiu-d2vq6' diff -- src styles.css test docs/superpowers/plans/2026-08-22-inline-link-indicator-implementation.md; rg -n "zk-show-link-indicator|zk-show-link-popover|scanInlineLinks" main.js src test

Expected: only the planned feature files contain changes, and the generated bundle includes the indicator and popover code.
