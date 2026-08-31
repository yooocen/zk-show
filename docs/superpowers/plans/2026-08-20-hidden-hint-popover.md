# Hidden Hint Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实关系图的隐藏提示圆点上提供可访问、可导航的语义浮层，说明隐藏关系并列出实际隐藏节点。

**Architecture:** 在投影层为每个 `HiddenHint` 保存语义来源和隐藏卡片；布局层把它们与真实路由端点合并为 `HiddenHintMarker` 并渲染 SVG 圆点；视图层维护一个不随画布缩放的 DOM 浮层，通过现有拖动阈值区分点击和拖动，并复用卡片导航。开发预览使用同一份标记数据实现等价的点击说明。

**Tech Stack:** TypeScript, Vitest, Obsidian ItemView DOM API, SVG, existing `layoutView` / `renderLayout` pipeline.

---

## 文件边界

- Modify `src/focus-projection.ts`: 保存隐藏提示的语义来源和隐藏节点卡片。
- Modify `src/hidden-hint-markers.ts`: 输出圆点渲染和浮层所需的完整标记数据。
- Modify `src/renderer.ts`: 在真实布局中渲染圆点，并把标记挂到 `Layout`。
- Create `src/hidden-hint-popover.ts`: 纯状态切换、文案和视口位置计算，不依赖 DOM。
- Modify `src/main.ts`: 管理浮层 DOM、键盘/指针交互、视口换算和节点导航。
- Modify `styles.css`: 圆点、浮层、节点项和幽灵节点样式。
- Modify `scripts/gen-real-preview.mjs`: 给真实预览注入标记数据和点击浮层。
- Modify `test/focus-projection.test.ts`: 验证四类提示的隐藏节点语义。
- Modify `test/hidden-hint-markers.test.ts`: 验证完整标记数据与路由端点。
- Create `test/hidden-hint-popover.test.ts`: 验证纯交互状态、文案和位置计算。
- Modify `test/renderer.test.ts`: 验证布局输出包含标记数据，不改变已有卡片和边坐标。
- Create `test/preview-markers.test.ts`: 验证生成的真实预览包含标记、文案和隐藏节点载荷。

### Task 1: 在投影层生成隐藏节点语义

**Files:**
- Modify `src/focus-projection.ts`
- Modify `test/focus-projection.test.ts`

- [ ] **Step 1: Write the failing tests**

在现有 `projectFocus` 测试中增加四类断言：

```ts
expect(projection.hints).toContainEqual(expect.objectContaining({
  kind: "continuation",
  sourceId: "1/13",
  hiddenIds: ["1/131"],
}));
expect(projection.hints).toContainEqual(expect.objectContaining({
  kind: "offTopic",
  sourceId: "1/13",
  hiddenIds: ["1/13a"],
}));
expect(projectFocus(graph, "1/11c")?.hints).toContainEqual(expect.objectContaining({
  kind: "fold",
  sourceId: "1/11",
  hiddenIds: ["1", "1/1"],
}));
```

另加根节点来源行测试，确认视觉 `anchorId: "1/1"` 的继续提示仍使用语义 `sourceId: "1"`。

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run:

```text
npm test -- test/focus-projection.test.ts
```

Expected: FAIL because `HiddenHint` 尚未包含 `sourceId` 和 `hiddenIds`。

- [ ] **Step 3: Add the semantic fields and helper construction**

把 `HiddenHint` 扩展为：

```ts
export interface HiddenHint {
  anchorId: string;
  sourceId: string;
  kind: HiddenHintKind;
  placement: HiddenHintPlacement;
  hiddenIds: string[];
  extend?: boolean;
}
```

在 `addHiddenChildHints` 中用当前可见卡集合过滤 `hiddenDigits` 和 `hiddenLetters`，创建提示时写入 `sourceId: card.code` 和对应编码数组。根节点继续提示保留 `anchorId` 指向来源行末卡，但 `sourceId` 保持根节点编码。

在 `projectFocus` 和 `projectOffTopicLine` 创建 `sourceTail` 时，从 `graph.topicLine(rootId)` 取截断点之后的节点编码；创建 `fold` 时，从 `graph.ancestors(baseLane.cards[0].code)` 取尚未可见的祖先编码。没有隐藏编码的提示不加入 `projection.hints`。

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run:

```text
npm test -- test/focus-projection.test.ts
```

Expected: all focus projection tests pass, including the new four-kind semantic assertions.

- [ ] **Step 5: Commit the semantic model change**

```text
git add src/focus-projection.ts test/focus-projection.test.ts
git commit -m "feat: attach hidden node semantics to hints"
```

### Task 2: 完善标记数据并接入真实布局

**Files:**
- Modify `src/hidden-hint-markers.ts`
- Modify `src/renderer.ts`
- Modify `test/hidden-hint-markers.test.ts`
- Modify `test/renderer.test.ts`

- [ ] **Step 1: Write the failing marker and layout tests**

增加以下行为断言：

```ts
expect(markers).toContainEqual(expect.objectContaining({
  kind: "continuation",
  sourceId: "1/13",
  hiddenIds: ["1/131"],
  label: "连续内容",
}));
expect(layout("1/11").markers.every((marker) => marker.x >= 0 && marker.y >= 0)).toBe(true);
```

验证 `fold` 标记仍取折线路径自由端，合并到共享主干的 `offTopic` 标记仍取主干延伸端点。

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```text
npm test -- test/hidden-hint-markers.test.ts test/renderer.test.ts
```

Expected: FAIL because marker metadata and `Layout.markers` are not defined.

- [ ] **Step 3: Define complete marker data**

把标记类型扩展为：

```ts
export interface HiddenHintMarker {
  id: string;
  kind: HiddenHintKind;
  anchorId: string;
  sourceId: string;
  hiddenIds: string[];
  x: number;
  y: number;
  dashed: boolean;
  mergedIntoSpine: boolean;
  label: string;
  description: string;
}
```

`collectHiddenHintMarkers` 为每个提示生成稳定 ID `${kind}:${sourceId}:${anchorId}:${index}`，保留现有端点选择逻辑，并从 `HiddenHint` 复制 `hiddenIds`。文案由 `kind` 和 `sourceId` 生成，不依赖 DOM。

在 `Layout` 中加入 `markers: HiddenHintMarker[]`。`layoutView` 先完成标准化，再以标准化后的边调用 `collectHiddenHintMarkers`，确保圆点坐标和卡片坐标使用同一坐标系。

- [ ] **Step 4: Render accessible SVG markers**

`renderLayout` 为每个 marker 创建：

```ts
const group = document.createElementNS(SVG_NS, "g");
group.setAttribute("class", `zk-show-hint-marker${marker.dashed ? " dashed" : ""}`);
group.setAttribute("data-hint-id", marker.id);
group.setAttribute("tabindex", "0");
group.setAttribute("role", "button");
group.setAttribute("aria-label", marker.label);
group.setAttribute("transform", `translate(${marker.x} ${marker.y})`);
```

在 group 内添加透明点击圆、强调环和实心/空心圆点，保持现有 SVG 线条坐标不变。

- [ ] **Step 5: Run focused tests and confirm they pass**

Run:

```text
npm test -- test/hidden-hint-markers.test.ts test/renderer.test.ts
```

Expected: marker metadata, endpoint selection, layout bounds and existing renderer assertions all pass.

- [ ] **Step 6: Commit the marker and renderer change**

```text
git add src/hidden-hint-markers.ts src/renderer.ts test/hidden-hint-markers.test.ts test/renderer.test.ts
git commit -m "feat: render semantic hidden hint markers"
```

### Task 3: 实现纯浮层状态和位置逻辑

**Files:**
- Create `src/hidden-hint-popover.ts`
- Create `test/hidden-hint-popover.test.ts`

- [ ] **Step 1: Write the failing tests**

测试以下纯函数：

```ts
expect(toggleHint(null, "a")).toBe("a");
expect(toggleHint("a", "a")).toBeNull();
expect(closeHint("a")).toBeNull();
expect(popoverPosition({ x: 780, y: 580 }, { width: 800, height: 620 }, { width: 240, height: 180 })).toMatchObject({
  side: "left",
  vertical: "above",
});
expect(hintDescription({ kind: "offTopic", sourceId: "1/13" })).toContain("1/13");
```

- [ ] **Step 2: Run the new test and confirm failure**

Run:

```text
npm test -- test/hidden-hint-popover.test.ts
```

Expected: FAIL because the popover module does not exist.

- [ ] **Step 3: Implement the pure helpers**

Export these exact types and functions:

```ts
export type HintPopoverState = string | null;
export type PopoverSide = "left" | "right";
export type PopoverVertical = "above" | "below";

export function toggleHint(current: HintPopoverState, nextId: string): HintPopoverState;
export function closeHint(_: HintPopoverState): null;
export function hintDescription(marker: Pick<HiddenHintMarker, "kind" | "sourceId">): string;
export function popoverPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  popover: { width: number; height: number },
  gap?: number,
): { left: number; top: number; side: PopoverSide; vertical: PopoverVertical };
```

The position helper tries right/below first, flips independently when bounds are exceeded, and clamps the final rectangle inside the viewport with an 8px margin.

- [ ] **Step 4: Run the pure tests and confirm they pass**

Run:

```text
npm test -- test/hidden-hint-popover.test.ts
```

Expected: all state, text and placement tests pass.

- [ ] **Step 5: Commit the pure popover helpers**

```text
git add src/hidden-hint-popover.ts test/hidden-hint-popover.test.ts
git commit -m "feat: add hidden hint popover state helpers"
```

### Task 4: 接入 Obsidian 视图浮层和节点导航

**Files:**
- Modify `src/main.ts`
- Modify `styles.css`

- [ ] **Step 1: Add view state and close hooks**

在 `ZkShowView` 增加 `currentLayout: Layout | null`、`openHintId: string | null` 和 `hintPopoverEl: HTMLElement | null`。在 `refresh`, `onClose`, `beginPan`, `beginPinch`, `onWheel` 和焦点切换路径调用统一的 `closeHintPopover()`。

- [ ] **Step 2: Route marker clicks before card navigation**

在 `navigateFromTarget` 开头处理 `.zk-show-hint-marker`：读取 `data-hint-id`，调用 `toggleHintPopover` 并返回。对 `.zk-show-hint-node` 读取 `data-code` 和 `data-path`，复用现有的 `focusCode`, `focusExpectedPath`, `openFile` 和 `refresh` 逻辑。

保留当前 `dragMoved` 判断，使只有未发生移动的指针抬起才打开圆点或列表项。

- [ ] **Step 3: Render the viewport-level popover**

`toggleHintPopover` 从 `currentLayout.markers` 找到 marker，创建 `.zk-show-hint-popover`，内容顺序为标题、描述、来源标签、节点列表。列表项写入 `data-code`, `data-path`, `role="button"` 和 `tabindex="0"`；幽灵项添加 `.is-ghost` 并移除导航属性。

以 `marker.x * scale + panX` 和 `marker.y * scale + panY` 计算圆点在根视口中的位置，调用 `popoverPosition` 后设置 `left`、`top`。浮层加入 root 而不是 canvas，避免被 transform 缩放。

- [ ] **Step 4: Add keyboard and blank-area behavior**

给 root 注册 `keydown`：当目标为 marker 且按下 `Enter` 或空格时打开；当按下 `Escape` 时关闭。空白区域的未拖动抬起关闭浮层。打开新 marker 时移动焦点到浮层标题，关闭时把焦点还给原 marker。

- [ ] **Step 5: Add styles**

加入 `.zk-show-hint-popover`, `.zk-show-hint-popover-title`, `.zk-show-hint-popover-source`, `.zk-show-hint-node`, `.zk-show-hint-node.is-ghost` 样式。浮层使用主题变量、最大宽度 280px、最大高度 240px、内部滚动、阴影和高层级；真实项悬停时使用主题强调色，幽灵项保持低对比度。

- [ ] **Step 6: Run the full existing tests and build**

Run:

```text
npm test
npm run build
```

Expected: all existing tests pass and `main.js` is rebuilt without TypeScript or bundling errors.

- [ ] **Step 7: Commit the Obsidian interaction**

```text
git add src/main.ts styles.css
git commit -m "feat: add clickable hidden hint popover"
```

### Task 5: 让真实 HTML 预览复用同一份交互数据

**Files:**
- Modify `scripts/gen-real-preview.mjs`
- Create `test/preview-markers.test.ts`

- [ ] **Step 1: Write the failing preview-generation test**

创建 `test/preview-markers.test.ts`，使用 Node 内置 API 调用生成脚本并读取结果：

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real preview hidden hint popover payload", () => {
  it("includes marker metadata and hidden node codes for 1/11", () => {
    execFileSync(process.execPath, ["scripts/gen-real-preview.mjs"], { stdio: "ignore" });
    const html = readFileSync("preview-real.html", "utf8");
    const section = html.match(/<h2>查看 1\/11（[\\s\\S]*?<\/section>/)?.[0] ?? "";
    expect(section).toContain("data-hint-id");
    expect(section).toContain("隐藏连续内容");
    expect(section).toContain("1/11a");
  });
});
```

- [ ] **Step 2: Run the assertion and confirm failure**

Run:

```text
node scripts/gen-real-preview.mjs
```

Expected: FAIL because the current HTML contains marker circles but no hidden-node payload or popover interaction.

- [ ] **Step 3: Serialize marker payload and add preview interaction**

为每个 preview section 输出 marker metadata，并在生成的 HTML 中加入与插件一致的内联样式：

```js
const hintPayload = JSON.stringify(r.markers.map((marker) => ({
  id: marker.id,
  label: marker.label,
  description: marker.description,
  sourceId: marker.sourceId,
  hiddenIds: marker.hiddenIds,
})));
```

圆点 group 写入 `data-hint-id`，页面脚本监听 marker click、空白 click、`Escape`，在当前 section 内创建同样结构的浮层。预览中的真实节点项显示选中状态并更新浮层标题，不调用 Obsidian 文件导航。内联样式必须包含 `.zk-show-hint-popover`, `.zk-show-hint-node` 和 `.zk-show-hint-node.is-ghost` 三个选择器。

- [ ] **Step 4: Regenerate and inspect the actual 1/11 preview**

Run:

```text
node scripts/gen-real-preview.mjs
```

Expected: clicking the `1/11` section’s small circle opens the explanation and hidden node list; clicking another circle replaces it; clicking blank space closes it.

- [ ] **Step 5: Copy the generated preview to the visual companion and open it**

Copy `preview-real.html` to `.superpowers/brainstorm/20260819-0053-visual/content/real-layout-preview.html`, then open the file in the Codex browser panel for visual verification.

- [ ] **Step 6: Run the preview test and confirm it passes**

Run:

```text
npm test -- test/preview-markers.test.ts
```

Expected: the generated `1/11` section contains a marker ID, a Chinese explanation, and at least one hidden node code.

- [ ] **Step 7: Commit the preview interaction**

```text
git add scripts/gen-real-preview.mjs preview-real.html
git commit -m "feat: demonstrate hidden hint popover in preview"
```

### Task 6: Full verification and handoff

**Files:**
- No new source files; verify all touched files and generated preview.

- [ ] **Step 1: Run the complete test suite**

Run:

```text
npm test
```

Expected: every test file passes, including projection, marker, popover, renderer, layout, viewport and model suites.

- [ ] **Step 2: Run the production build**

Run:

```text
npm run build
```

Expected: esbuild exits with code 0 and writes the rebuilt `main.js`.

- [ ] **Step 3: Verify key preview sections structurally**

Check `preview-real.html` for sections `1/11`, `1/11c`, and `1/13a1`; each must contain marker groups, labels, and serialized hidden-node data where the projection has hints.

- [ ] **Step 4: Perform visual interaction checks**

In the opened preview verify:

1. `1/11` continuation and off-topic circles show different explanations.
2. The list displays hidden codes in relation order.
3. The `1/11c` fold circle lists the omitted ancestors.
4. The popover flips sides near viewport edges.
5. Dragging and zooming close the popover without changing card coordinates.

- [ ] **Step 5: Review the final diff and report any environment limits**

Run:

```text
git diff --check
git status --short
```

Report test/build results, preview path, and any repository or transcript write operation still awaiting external approval.

- [ ] **Step 6: Commit the verified final state**

```text
git add src test styles.css scripts/gen-real-preview.mjs preview-real.html
git commit -m "feat: explain hidden hint markers interactively"
```
