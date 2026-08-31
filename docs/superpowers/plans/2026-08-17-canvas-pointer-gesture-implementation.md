# Canvas Pointer Gesture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让卡片画布支持统一指针拖动、双指捏合缩放和 `Ctrl + 滚轮` 缩放。

**Architecture:** 新建独立的视口变换模块，保存平移和缩放并保证缩放焦点不漂移。`ZkShowView` 将鼠标、触屏与触控笔事件统一映射为 Pointer Events，并把视口状态应用到画布变换。

**Tech Stack:** TypeScript、Obsidian ItemView、浏览器 Pointer Events、Vitest。

---

### Task 1: 视口变换计算

**Files:**
- Create: `src/viewport.ts`
- Create: `test/viewport.test.ts`

- [x] **Step 1: 写入失败测试**

```ts
import { describe, expect, it } from "vitest";
import { pinchScale, zoomViewportAt } from "../src/viewport";

describe("viewport", () => {
  it("缩放时保持焦点下的画布坐标不变", () => {
    expect(zoomViewportAt({ panX: 10, panY: 20, scale: 1 }, { x: 100, y: 80 }, 2)).toEqual({
      panX: -80,
      panY: -40,
      scale: 2,
    });
  });

  it("把捏合比例限制在 50% 到 250%", () => {
    expect(pinchScale(1, 100, 20)).toBe(0.5);
    expect(pinchScale(1, 100, 400)).toBe(2.5);
  });
});
```

- [x] **Step 2: 运行失败测试**

Run: `npx.cmd vitest run test/viewport.test.ts`

Expected: FAIL，因为 `src/viewport.ts` 尚不存在。

- [x] **Step 3: 实现最小视口模块**

```ts
export interface ViewportState {
  panX: number;
  panY: number;
  scale: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.5;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomViewportAt(state: ViewportState, focal: ViewportPoint, requestedScale: number): ViewportState {
  const scale = clampScale(requestedScale);
  const ratio = scale / state.scale;
  return {
    panX: focal.x - (focal.x - state.panX) * ratio,
    panY: focal.y - (focal.y - state.panY) * ratio,
    scale,
  };
}

export function pinchScale(startScale: number, startDistance: number, currentDistance: number): number {
  return clampScale(startScale * (currentDistance / startDistance));
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx.cmd vitest run test/viewport.test.ts`

Expected: PASS，2 个测试通过。

### Task 2: 指针事件与缩放接入

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`

- [x] **Step 1: 将视图状态扩展为平移、缩放和活动指针集合**

```ts
private scale = 1;
private readonly activePointers = new Map<number, { x: number; y: number }>();
private pinchStartScale = 1;
private pinchStartDistance = 0;
private pinchStartMidpoint = { x: 0, y: 0 };
private pinchBasePanX = 0;
private pinchBasePanY = 0;
```

- [x] **Step 2: 用 Pointer Events 替换鼠标专用监听**

```ts
this.rootEl.addEventListener("pointerdown", this.onPointerDown);
this.rootEl.addEventListener("pointermove", this.onPointerMove);
this.rootEl.addEventListener("pointerup", this.onPointerEnd);
this.rootEl.addEventListener("pointercancel", this.onPointerEnd);
this.rootEl.addEventListener("wheel", this.onWheel, { passive: false });
```

- [x] **Step 3: 实现单指平移、双指捏合与 Ctrl + 滚轮**

```ts
private applyViewport(): void {
  this.canvasEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
}

private onWheel = (ev: WheelEvent): void => {
  if (!ev.ctrlKey) return;
  ev.preventDefault();
  const rect = this.rootEl.getBoundingClientRect();
  const focal = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  const delta = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? ev.deltaY * 16 : ev.deltaY;
  this.setViewport(zoomViewportAt(this.viewport(), focal, this.scale * Math.exp(-delta * 0.002)));
};
```

- [x] **Step 4: 让居中和双击复位纳入缩放状态**

```ts
private resetViewport(): void {
  this.scale = 1;
  this.centerCanvas();
}
```

`centerCanvas()` 必须按照 `pan = viewportCenter - canvasPoint * scale` 计算平移，确保当前卡片在任意缩放后仍能居中。

- [x] **Step 5: 补充画布滚动隔离样式**

```css
.zk-show-root {
  overscroll-behavior: contain;
}
```

### Task 3: 全量验证

**Files:**
- Verify: `test/viewport.test.ts`
- Verify: `src/main.ts`

- [x] **Step 1: 运行全量测试与类型检查**

Run: `npm.cmd test; npx.cmd tsc --noEmit`

Expected: 所有测试通过，TypeScript 无错误。

- [x] **Step 2: 构建插件并生成预览**

Run: `npm.cmd run build; node scripts\gen-math-preview.mjs`

Expected: `main.js` 构建成功，数学预览包含 25 个视图。

- [ ] **Step 3: 手工交互验收**

在 Obsidian 插件视图中验证：鼠标左键拖动、触屏单指拖动、双指捏合、`Ctrl + 滚轮`、双击复位，以及拖动后卡片点击不跳转。
