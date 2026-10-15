# 题外话兄弟卡片全量展示实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 查看题外话主行上的任意卡（`1/14a`、`1/14a1`）时，锚点下所有字母兄弟都显示为卡片，并且每张兄弟卡自己的提示线（后续数字的实线、自己题外话的虚线）都画在正确位置。

**Architecture:** 投影层新增 `following` 泳道承载"焦点之后的字母兄弟"（原来折叠成主干延伸提示）；布局层把 `previous + branch + following` 视为同一区域组，并在竖列里为带"向下提示"的卡片预留 `verticalHintLength`，让虚线垂直挂在卡片下方而不是绕行。改动后 `extend`（主干延伸提示）失去生产者，一并删除。

**Tech Stack:** TypeScript（strict）、vitest、esbuild、Obsidian 插件。布局管线：`computeView → projectFocus → compileLayoutGraph → solveLayout → routeEdges → normalizeLayout → renderLayout`。

**Spec:** `docs/superpowers/specs/2026-10-15-offtopic-sibling-cards-design.md`

---

## 执行环境注意（先读这三条）

1. 本机受限沙箱下 `npm test` / `npx vitest run` / 预览脚本会报
   `Error: spawn EPERM ... at ensureServiceIsRunning (node_modules/esbuild/lib/main.js:1975)`。
   **这不是代码问题**，是沙箱不允许 Node 用管道捕获子进程输出。用更宽的执行权限重跑同一条命令即可（本会话用 `danger-full-access`）。
2. 跑完全量测试后 `preview-real.html` 会被 `test/preview-markers.test.ts` 重新生成。不属于本任务的预览文件改动请用 `git checkout -- preview-real.html` 复原，避免把无关 diff 混进提交。
3. 每个任务收尾都要：目标测试文件通过 → `npx tsc --noEmit` 无输出 → 提交。本次改动直接在 `main` 工作区进行（未新建 worktree）；若需要隔离，执行前先用 `using-git-worktrees` 建分支。

## 文件结构

| 文件 | 动作 | 责任 |
| --- | --- | --- |
| `test/fixtures/offtopic-siblings.ts` | 新建 | 兄弟场景共用测试数据：`1/14` 下 a、b、c；b 带 `1/14b1`+`1/14ba`，c 带 `1/14c1`+`1/14ca` |
| `src/focus-projection.ts` | 修改 | 新增 `following` 泳道角色与 `FocusProjection.followingLane`；判定"焦点之后的兄弟" |
| `src/layout/compiler.ts` | 修改 | `sourceLanes` 纳入 following；共享虚线主干串联 `previous + 焦点 + following` |
| `src/layout/solver.ts` | 修改 | following 竖列摆放；`laneGroup` 纳入 following；**列内为"向下提示"预留空间** |
| `src/layout/regions.ts` | 修改 | 三条泳道合并成同一区域，保持紧凑行距 |
| `src/layout/types.ts` | 修改（Task 3） | 删除 spine spec 的 `extend` 字段 |
| `src/layout/router.ts` | 修改（Task 3） | 删除 `extend` 造成的端点延伸 |
| `src/hidden-hint-markers.ts` | 修改（Task 3） | 删除 `mergedIntoSpine` 合并路径 |
| `scripts/gen-preview.mjs` 等 3 个脚本 | 修改（Task 4） | 递归查找卡片文字，修掉空卡预览 |
| `test/*.test.ts` | 修改 | 7 处固化旧规则的断言改写 + 新增 5 条覆盖新规则 |
| `preview*.html`、`main.js` | 重新生成 | 预览页与插件产物 |

---

### Task 1: 丢弃原型，回到绿色基线

工作区里现在有一份未提交的原型实现（4 个 src 文件），本计划要从干净基线按 TDD 重做，所以先丢弃它。原型的最终代码已完整收录在本计划的 Task 2 / Task 3 中，不会丢失。

**Files:**
- 修改：无（仅还原 `src/`）

- [ ] **Step 1: 确认待丢弃的原型范围**

```powershell
git status --short
```

Expected：

```text
 M src/focus-projection.ts
 M src/layout/compiler.ts
 M src/layout/regions.ts
 M src/layout/solver.ts
?? .tmp/
?? preview-offtopic-siblings.html
```

（`.tmp/` 与 `preview-offtopic-siblings.html` 是本计划的开发探针/对照页，属未跟踪文件，可留到最后清理。）

- [ ] **Step 2: 备份原型，便于比对**

```powershell
New-Item -ItemType Directory -Force .tmp/proto | Out-Null
Copy-Item src/focus-projection.ts .tmp/proto/focus-projection.ts -Force
Copy-Item src/layout/compiler.ts .tmp/proto/compiler.ts -Force
Copy-Item src/layout/solver.ts .tmp/proto/solver.ts -Force
Copy-Item src/layout/regions.ts .tmp/proto/regions.ts -Force
```

- [ ] **Step 3: 还原 src**

```powershell
git checkout -- src
git status --short
```

Expected：只剩 `?? .tmp/` 与 `?? preview-offtopic-siblings.html`。

- [ ] **Step 4: 确认基线全绿**

```powershell
npm test
```

Expected：`Test Files  25 passed (25)` / `Tests  154 passed (154)`。
若报 `spawn EPERM`，按"执行环境注意"第 1 条放宽权限重跑。

- [ ] **Step 5: 无需提交**（本任务不产生改动）

---

### Task 2: following 泳道从投影一路打通到坐标

这是本次改动的全部实现。顺序严格是：先写失败测试 → 跑出红 → 再实现 → 跑出绿。

**Files:**
- Create: `test/fixtures/offtopic-siblings.ts`
- Modify: `src/focus-projection.ts`、`src/layout/compiler.ts`、`src/layout/solver.ts`、`src/layout/regions.ts`
- Modify: `test/focus-projection.test.ts`、`test/layout-compiler.test.ts`、`test/layout-router.test.ts`、`test/layout-solver.test.ts`、`test/renderer.test.ts`、`test/model.test.ts`、`test/hidden-hint-markers.test.ts`

- [ ] **Step 1: 新建兄弟场景测试数据**

Create `test/fixtures/offtopic-siblings.ts`：

```ts
import type { ZRecord } from "../../src/topic-graph";

/**
 * 1/14 下有 a、b、c 三张题外话卡：
 * - 1/14b 同时有后续数字（1/14b1）和自己的题外话（1/14ba）
 * - 1/14c 同时有后续数字（1/14c1）和自己的题外话（1/14ca）
 * - 1/14a1 是题外话主行上的数字继续卡
 * 用来验证"兄弟卡自己的提示线也要显示"。
 */
export const OFFTOPIC_SIBLING_RECORDS: ZRecord[] = [
  { path: "数学.md", basename: "数学", no: "1" },
  { path: "线性代数.md", basename: "线性代数", no: "1/1" },
  { path: "第3章 向量空间与子空间.md", basename: "第3章 向量空间与子空间", no: "1/14" },
  { path: "R^n之外的三个向量空间.md", basename: "R^n 之外的三个向量空间", no: "1/14a" },
  { path: "子空间的定义.md", basename: "子空间的定义", no: "1/14a1" },
  { path: "子空间与基的关系.md", basename: "子空间与基的关系", no: "1/14b" },
  { path: "基的判定.md", basename: "基的判定", no: "1/14b1" },
  { path: "几何直觉补充.md", basename: "几何直觉补充", no: "1/14ba" },
  { path: "维数与秩的几何意义.md", basename: "维数与秩的几何意义", no: "1/14c" },
  { path: "秩的等价刻画.md", basename: "秩的等价刻画", no: "1/14c1" },
  { path: "几何直觉补充二.md", basename: "几何直觉补充二", no: "1/14ca" },
];
```

- [ ] **Step 2: 写失败测试（投影层）**

Modify `test/focus-projection.test.ts`：
1. 顶部 import 增加一行（放在 `MATH_TOPIC_RECORDS` 那行下面）：

```ts
import { OFFTOPIC_SIBLING_RECORDS } from "./fixtures/offtopic-siblings";
```

2. `describe("projectFocus", () => {` 里 `const graph = new TopicGraph(MATH_TOPIC_RECORDS);` 下面加一行：

```ts
  const siblingGraph = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);
```

3. 把现有的 `it("查看字母分支时保留前置字母兄弟并折叠后续兄弟", ...)`（整段，含 `1/11c` 断言和 `extend: true` 断言）替换为：

```ts
  it("查看字母分支时前置兄弟在上方竖列、后续兄弟在下方竖列", () => {
    const projection = projectFocus(graph, "1/11c")!;

    expect(codes(projection.baseLane)).toEqual(["1/11"]);
    expect(codes(projection.previousLane)).toEqual(["1/11a", "1/11b"]);
    expect(codes(projection.branchLane)).toEqual(["1/11c", "1/11c1"]);
    expect(codes(projection.followingLane)).toEqual(["1/11d"]);
    expect(projection.branchLane).toMatchObject({ direction: "below", relation: "offTopic", anchorId: "1/11" });
    expect(projection.followingLane).toMatchObject({
      direction: "below",
      relation: "offTopic",
      anchorId: "1/11",
      orientation: "vertical",
    });
    expect(projection.folded).toBe(true);
    // 锚点下的字母兄弟全部可见后，锚点自己不再产生"后面还有题外分支"的延伸提示
    expect(projection.hints.some((hint) => hint.anchorId === "1/11" && hint.kind === "offTopic")).toBe(false);
    // 前置兄弟自己的后续数字仍然以提示线表达
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/11a",
        sourceId: "1/11a",
        kind: "continuation",
        placement: "trailing",
        hiddenIds: ["1/11a1", "1/11a2"],
      })
    );
  });
```

4. 在同一个 `describe` 内追加两条新测试（放在上面那条测试之后）：

```ts
  it("后续兄弟自己的后续数字与自己的题外话都保留提示线", () => {
    const projection = projectFocus(siblingGraph, "1/14a")!;

    expect(codes(projection.previousLane)).toEqual([]);
    expect(codes(projection.branchLane)).toEqual(["1/14a", "1/14a1"]);
    expect(codes(projection.followingLane)).toEqual(["1/14b", "1/14c"]);
    // 1/14b 的后续数字 1/14b1：卡右侧实线提示
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/14b",
        sourceId: "1/14b",
        kind: "continuation",
        placement: "trailing",
        hiddenIds: ["1/14b1"],
      })
    );
    // 1/14b 自己的题外话 1/14ba：卡下方虚线提示
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/14b",
        sourceId: "1/14b",
        kind: "offTopic",
        placement: "below",
        hiddenIds: ["1/14ba"],
      })
    );
    // 锚点自己不产生延伸提示
    expect(projection.hints.some((hint) => hint.anchorId === "1/14" && hint.kind === "offTopic")).toBe(false);
  });

  it("题外话主行上的数字继续卡与起点卡看到同一批兄弟", () => {
    const asOrigin = projectFocus(siblingGraph, "1/14a")!;
    const asContinuation = projectFocus(siblingGraph, "1/14a1")!;

    expect(codes(asContinuation.branchLane)).toEqual(["1/14a", "1/14a1"]);
    expect(codes(asContinuation.followingLane)).toEqual(codes(asOrigin.followingLane));
    expect(codes(asContinuation.previousLane)).toEqual(codes(asOrigin.previousLane));
  });
```

- [ ] **Step 3: 跑测试确认变红**

```powershell
npx vitest run test/focus-projection.test.ts
```

Expected：FAIL。失败信息形如 `expected [] to deeply equal [ '1/11d' ]`（`codes(projection.followingLane)` 目前恒为 `[]`），新测试里 `1/14b` 的 `kind: "offTopic"` 提示也找不到。

- [ ] **Step 4: 实现投影层**

Modify `src/focus-projection.ts`（5 处）：

1. `ProjectionLaneRole` 这一行（`grep -n "ProjectionLaneRole =" src/focus-projection.ts`）末尾加一个成员，改为：

```ts
export type ProjectionLaneRole = "source" | "focus" | "expansion" | "previous" | "following";
```

2. `FocusProjection` 接口里 `previousLane: ProjectionLane | null;` 下面插入：

```ts
  /** 焦点之后的题外话兄弟；与 previousLane 对称，排在焦点行下方。 */
  followingLane: ProjectionLane | null;
```

3. `addHiddenChildHints` 开头那一行

```ts
  const lanes = [projection.baseLane, projection.branchLane, projection.previousLane, ...projection.expansionLanes];
```

改为：

```ts
  const lanes = [
    projection.baseLane,
    projection.branchLane,
    projection.previousLane,
    projection.followingLane,
    ...projection.expansionLanes,
  ];
```

4. `projectOffTopicLine` 里 `const allLetters = ...`（约 257 行）到 `cardCodes([...])`（约 276 行）整段替换为：

```ts
  const allLetters = graph.letterChildren(anchorId);
  const originIndex = allLetters.findIndex((node) => node.code === origin.code);
  const previousNodes = originIndex > 0 ? allLetters.slice(0, originIndex) : [];
  const followingNodes = originIndex >= 0 ? allLetters.slice(originIndex + 1) : [];
  const previousLane =
    previousNodes.length > 0
      ? lane("previous", "previous", "vertical", "below", "offTopic", anchorId, previousNodes, focus.code)
      : null;
  if (previousLane) previousLane.extendSpine = true;
  // 焦点之后的题外话兄弟同样展示：沿主干排在焦点行下方，不再折叠成延伸提示。
  const followingLane =
    followingNodes.length > 0
      ? lane("following", "following", "vertical", "below", "offTopic", anchorId, followingNodes, focus.code)
      : null;

  const projection: FocusProjection = {
    rootId,
    focusId: focus.code,
    baseLane,
    branchLane,
    previousLane,
    followingLane,
    expansionLanes: [],
    hints: [],
    folded: source.folded,
  };
  projection.expansionLanes = expansionLanes(
    graph,
    focus.code,
    cardCodes([baseLane, branchLane, previousLane, followingLane])
  );
```

5. 另外两个 `FocusProjection` 字面量各补一个字段（`grep -n "previousLane: null," src/focus-projection.ts` 会命中两处，约 312 行与 360 行），都在 `previousLane: null,` 下面加：

```ts
      followingLane: null,
```

- [ ] **Step 5: 跑测试确认变绿**

```powershell
npx vitest run test/focus-projection.test.ts
```

Expected：PASS（该文件全部通过）。

- [ ] **Step 6: 写失败测试（compiler 主干 + router 接线）**

Modify `test/layout-compiler.test.ts`，把 `it("把字母历史节点与当前节点编译到同一条共享虚线主干", ...)` 整段替换为：

```ts
  it("把全部字母兄弟与当前节点编译到同一条共享虚线主干", () => {
    const projection = projectFocus(graph, "1/11c")!;
    const layoutGraph = compileLayoutGraph(projection);
    const spine = layoutGraph.edges.find((edge) => edge.kind === "spine" && edge.sourceId === "1/11");
    const following = layoutGraph.lanes.find((lane) => lane.id === "following")!;

    expect(spine).toMatchObject({
      style: "dashed",
      targetIds: ["1/11a", "1/11b", "1/11c", "1/11d"],
      direction: "below",
    });
    expect(following.nodeIds).toEqual(["1/11d"]);
    expect(layoutGraph.constraints).toContainEqual(
      expect.objectContaining({
        kind: "rightOf",
        subjects: ["1/11a", "1/11b", "1/11c", "1/11d"],
        anchor: "1/11",
      })
    );
  });
```

Modify `test/layout-router.test.ts`，把 `it("字母分支只生成一条共享虚线主干，并为每张来源卡生成横向接线", ...)` 整段替换为：

```ts
  it("字母分支只生成一条共享虚线主干，并为每张兄弟卡生成横向接线", () => {
    const routed = route("1/11c");
    const parent = routed.nodes.find((node) => node.id === "1/11")!;
    const last = routed.nodes.find((node) => node.id === "1/11d")!;
    const spine = routed.edges.filter(
      (edge) => edge.kind === "vbar" && edge.dashed && edge.sourceId === "1/11" && edge.groupId?.startsWith("branch-spine")
    );
    const links = routed.edges.filter(
      (edge) => edge.kind === "link" && edge.dashed && edge.sourceId === "1/11" && edge.groupId === spine[0]?.groupId
    );

    expect(spine).toHaveLength(1);
    expect(spine[0].x1).toBe(parent.x + parent.width / 2);
    expect(links.map((edge) => edge.targetId)).toEqual(["1/11a", "1/11b", "1/11c", "1/11d"]);
    // 主干终点是最后一张兄弟卡的中心，不再为"隐藏的后续兄弟"多伸一截
    expect(spine[0].y2).toBe(last.y + last.height / 2);
  });
```

- [ ] **Step 7: 跑测试确认变红**

```powershell
npx vitest run test/layout-compiler.test.ts test/layout-router.test.ts
```

Expected：layout-compiler FAIL（`targetIds` 目前只有 `["1/11a","1/11b","1/11c"]`，且 `following` 泳道不存在 → `following` 为 `undefined` 抛错）；layout-router FAIL（`links` 目前只有 3 条）。

- [ ] **Step 8: 实现 compiler**

Modify `src/layout/compiler.ts`（2 处）：

1. 约 42 行，`sourceLanes` 里 `...(projection.previousLane ? [projection.previousLane] : []),` 下面插入一行：

```ts
    ...(projection.followingLane ? [projection.followingLane] : []),
```

2. 约 93-96 行，把

```ts
      const targets = [
        ...(projection.previousLane?.cards.map((card) => card.id) ?? []),
        projection.branchLane.cards[0].id,
      ];
```

改为：

```ts
      const targets = [
        ...(projection.previousLane?.cards.map((card) => card.id) ?? []),
        projection.branchLane.cards[0].id,
        ...(projection.followingLane?.cards.map((card) => card.id) ?? []),
      ];
```

（`router.ts` 本任务不动：主干端点延伸由 `extend` 决定，而 `extend` 的生产者已在 Step 4 消失，端点自然落在最后一张兄弟卡中心。）

- [ ] **Step 9: 跑测试确认变绿**

```powershell
npx vitest run test/layout-compiler.test.ts test/layout-router.test.ts
```

Expected：两个文件都 PASS。

- [ ] **Step 10: 写失败测试（solver 竖列摆放 + 列内预留空间 + 提示线段形状）**

Modify `test/layout-solver.test.ts`：
1. import 增加：

```ts
import { OFFTOPIC_SIBLING_RECORDS } from "./fixtures/offtopic-siblings";
```

2. 把 `it("不同泳道的重叠水平范围保留完整行间净距", ...)` 里这一行

```ts
          if (new Set(["previous", "branch"]).has(first.laneId) && new Set(["previous", "branch"]).has(second.laneId)) continue;
```

改为：

```ts
          // previous / branch / following 是同一条题外话区域内的紧凑竖列，行距由 verticalGap 约束
          const tightLanes = new Set(["previous", "branch", "following"]);
          if (tightLanes.has(first.laneId) && tightLanes.has(second.laneId)) continue;
```

3. 在 `describe` 内追加两条测试：

```ts
  it("后续字母兄弟与前置兄弟、焦点卡保持同一列", () => {
    const solved = solve("1/11c");
    const previous = node(solved, "1/11b");
    const current = node(solved, "1/11c");
    const following = node(solved, "1/11d");

    expect(current.x).toBe(previous.x);
    expect(following.x).toBe(previous.x);
    expect(following.y).toBeGreaterThan(current.y + current.height);
  });

  it("带向下提示的竖列卡为提示线预留空间，且仍在紧凑行距内", () => {
    const family = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);
    const solved = solveLayout(compileLayoutGraph(projectFocus(family, "1/14a")!));
    const b = node(solved, "1/14b");
    const c = node(solved, "1/14c");
    const gap = c.y - (b.y + b.height);

    // 1/14b 有自己的题外话（1/14ba），它的虚线提示要垂直挂在 1/14b 下方
    expect(gap).toBeGreaterThanOrEqual(LAYOUT_METRICS.verticalGap + LAYOUT_METRICS.verticalHintLength);
    // 预留后仍属同一紧凑区域，不能被推到 rowGap
    expect(gap).toBeLessThan(LAYOUT_METRICS.rowGap);
  });
```

Modify `test/layout-router.test.ts`：import 增加一行

```ts
import { OFFTOPIC_SIBLING_RECORDS } from "./fixtures/offtopic-siblings";
```

并在 `describe` 内追加：

```ts
  it("兄弟卡自己的题外话提示垂直挂在它下方，不绕行", () => {
    const family = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);
    const routed = routeEdges(solveLayout(compileLayoutGraph(projectFocus(family, "1/14a")!)));
    const b = routed.nodes.find((node) => node.id === "1/14b")!;
    const stub = routed.edges.find((edge) => edge.groupId?.startsWith("offTopic:1/14b:"))!;

    expect(stub).toBeDefined();
    expect(stub.kind).toBe("vbar");
    expect(stub.dashed).toBe(true);
    expect(stub.x1).toBe(b.x + b.width / 2);
    expect(stub.x2).toBe(b.x + b.width / 2);
    expect(stub.y1).toBe(b.y + b.height);
    expect(stub.y2).toBe(b.y + b.height + LAYOUT_METRICS.verticalHintLength);
  });
```

- [ ] **Step 11: 跑测试确认变红**

```powershell
npx vitest run test/layout-solver.test.ts test/layout-router.test.ts
```

Expected：FAIL。layout-solver 至少两条失败（`following` 卡没有坐标 → `missing node 1/11d`；预留不足 → `expected 24 to be >= 49`）；layout-router 的竖线段测试失败（当前是绕行折线 `poly`，`stub.kind` 为 `poly`）。

- [ ] **Step 12: 实现 solver 与 regions**

Modify `src/layout/solver.ts`（4 处）：

1. `placeVertical`（约 20-26 行）整段替换为：

```ts
function placeVertical(
  nodes: LayoutNode[],
  x: number,
  startY: number,
  positions: Map<string, Point>,
  extraGapAfter?: (node: LayoutNode) => number
): void {
  let y = startY;
  for (const node of nodes) {
    positions.set(node.id, { x, y });
    y += node.height + LAYOUT_METRICS.verticalGap + (extraGapAfter ? extraGapAfter(node) : 0);
  }
}

/**
 * 竖列卡片自己的"向下提示"（题外话分支）需要预留的竖直空间。
 * 兄弟列默认间距 verticalGap(24) 比提示线长度 verticalHintLength(25) 还小，
 * 不预留的话中间兄弟的虚线提示只能绕到旁边，看起来像挂错了地方。
 */
function hintSpaceAfter(graph: LayoutGraph, node: LayoutNode): number {
  const hasBelowHint = graph.edges.some(
    (edge) => edge.kind === "hint" && edge.placement === "below" && edge.sourceId === node.id
  );
  return hasBelowHint ? LAYOUT_METRICS.verticalHintLength : 0;
}

function columnHeight(graph: LayoutGraph, nodes: LayoutNode[]): number {
  return nodes.reduce(
    (total, node) => total + node.height + LAYOUT_METRICS.verticalGap + hintSpaceAfter(graph, node),
    0
  );
}
```

2. `laneGroup`（约 44-50 行）整段替换为：

```ts
function laneGroup(graph: LayoutGraph, laneId: string): string[] {
  const offTopicLaneIds = ["previous", "branch", "following"];
  const branch = graph.lanes.find((lane) => lane.id === "branch");
  if (branch?.relation === "offTopic" && offTopicLaneIds.includes(laneId)) {
    return graph.lanes.filter((lane) => offTopicLaneIds.includes(lane.id)).map((lane) => lane.id);
  }
  return [laneId];
}
```

3. 约 123-124 行，`const previousLane = graph.lanes.find((lane) => lane.id === "previous");` 下面插入一行：

```ts
  const followingLane = graph.lanes.find((lane) => lane.id === "following");
```

4. 约 141-148 行的 offTopic 分支（`} else {` 到 `}`）替换为：

```ts
      } else {
        const firstX = anchorPoint.x + anchor.width + LAYOUT_METRICS.horizontalGap;
        const stackTop = anchorPoint.y + anchor.height + LAYOUT_METRICS.rowGap;
        const previousNodes = previousLane ? nodesForLane(graph, previousLane) : [];
        const reserveHint = (node: LayoutNode) => hintSpaceAfter(graph, node);
        placeVertical(previousNodes, firstX, stackTop, positions, reserveHint);
        const focusTop = stackTop + columnHeight(graph, previousNodes);
        placeHorizontal(branchNodes, firstX, focusTop, positions);
        // 焦点之后的题外话兄弟紧接焦点行下方，保持同一列与紧凑 verticalGap。
        const followingNodes = followingLane ? nodesForLane(graph, followingLane) : [];
        const focusRowHeight = Math.max(...branchNodes.map((node) => node.height), 0);
        placeVertical(
          followingNodes,
          firstX,
          focusTop + focusRowHeight + LAYOUT_METRICS.verticalGap,
          positions,
          reserveHint
        );
      }
```

Modify `src/layout/regions.ts`，`buildLaneRegions` 里（约 52-55 行）

```ts
  const branch = graph.lanes.find((lane) => lane.id === "branch");
  const previous = graph.lanes.find((lane) => lane.id === "previous");
  const mergedOffTopic = branch?.relation === "offTopic" && previous ? [previous.id, branch.id] : null;
```

改为：

```ts
  const branch = graph.lanes.find((lane) => lane.id === "branch");
  const offTopicLaneIds = ["previous", "branch", "following"];
  const offTopicLanes = graph.lanes.filter((lane) => offTopicLaneIds.includes(lane.id));
  const mergedOffTopic = branch?.relation === "offTopic" && offTopicLanes.length > 0 ? offTopicLanes.map((lane) => lane.id) : null;
```

- [ ] **Step 13: 跑测试确认变绿**

```powershell
npx vitest run test/layout-solver.test.ts test/layout-router.test.ts
```

Expected：两个文件都 PASS。

- [ ] **Step 14: 更新下游行为断言（renderer / model / hidden-hint-markers）**

Modify `test/renderer.test.ts`，`it("查看字母分支时使用共享虚线主干和右偏卡片", ...)` 里把

```ts
    expect(result.cards).toHaveLength(8);
```

改为：

```ts
    // 来源行 5 张 + 题外话主行 3 张（1/4a、1/4a1、1/4a2）+ 后续兄弟 1 张（1/4b）
    expect(result.cards).toHaveLength(9);
```

Modify `test/model.test.ts`，`it("字母分支保留截断来源行、数值后代和三类来源提示", ...)` 里：
1. 把这一行

```ts
    expect(view.hints).toContainEqual(expect.objectContaining({ anchorId: "1/4", kind: "offTopic", extend: true }));
```

替换为：

```ts
    expect(codes(view.followingLane)).toEqual(["1/4b"]);
```

2. 该测试名里的"三类来源提示"改为"来源提示"，即：

```ts
  it("字母分支保留截断来源行、数值后代与来源提示，并显示后续兄弟", () => {
```

Modify `test/hidden-hint-markers.test.ts`：整段删除

```ts
  it("题外后续被合并进共享主干时使用主干延伸端点", () => {
    ...
  });
```

（即第 34-47 行那一条测试。删除原因：字母兄弟全部显示后，"题外后续被合并进主干延伸"不再产生，`mergedIntoSpine` 路径在 Task 3 一并删除。）

- [ ] **Step 15: 全量回归**

```powershell
npm test
```

Expected：`Test Files  25 passed (25)` / `Tests  158 passed (158)`
（154 条基线 + 新增 5 条 - 删除 1 条 = 158；若条数有出入，以"全部通过"为准并核对是否有测试被误删。）

```powershell
git checkout -- preview-real.html
```

- [ ] **Step 16: 类型检查**

```powershell
npx tsc --noEmit
```

Expected：无输出。

- [ ] **Step 17: 提交**

```powershell
git add src test
git commit -m "feat: 题外话兄弟卡片全量展示，并为兄弟提示线预留竖直空间" -m "查看题外话主行任意卡时，锚点下所有字母兄弟都显示为卡片：焦点以前的排在焦点行上方竖列，焦点以后的排在下方竖列。兄弟卡自己的后续数字（实线）与自己的题外话（虚线）提示保留；竖列内为向下提示预留 verticalHintLength，避免中间兄弟的虚线绕行到相邻卡旁边。"
```

---

### Task 3: 清理不可达的 extend / 合并主干机制

字母兄弟全部显示后，"后续兄弟折叠成主干延伸提示"不再有任何生产者，这些代码变成死代码。本任务只删代码，不改行为：全量测试必须保持 158 条全绿。

**Files:**
- Modify: `src/focus-projection.ts`、`src/layout/types.ts`、`src/layout/compiler.ts`、`src/layout/router.ts`、`src/hidden-hint-markers.ts`

- [ ] **Step 1: 删除投影层的 extend 字段与死分支**

Modify `src/focus-projection.ts`：
1. `ProjectionLane` 接口里删除这一行：

```ts
  extendSpine?: boolean;
```

2. `HiddenHint` 接口里删除这一行：

```ts
  extend?: boolean;
```

3. 删除 `projectOffTopicLine` 里这一行（`previousLane` 判空后设置）：

```ts
  if (previousLane) previousLane.extendSpine = true;
```

4. `addHiddenChildHints` 里 `if (hiddenLetters.length > 0) { ... }` 这一段替换为（去掉 `hiddenAfterCurrent` 与 `extend`）：

```ts
      if (hiddenLetters.length > 0) {
        hints.push({
          anchorId: card.code,
          sourceId: card.code,
          kind: "offTopic",
          placement: "below",
          hiddenIds: hiddenLetters.map((node) => node.code),
        });
      }
```

5. 通用父级分支里（`projectFocus` 中 `const relation = focus.edgeKind;` 之后、`const projection: FocusProjection = {` 之前）删除这一整段死代码：

```ts
  const allLetters = graph.letterChildren(parentId);
  const focusLetterIndex = allLetters.findIndex((node) => node.code === focusId);
  const previousNodes = relation === "offTopic" && focusLetterIndex > 0 ? allLetters.slice(0, focusLetterIndex) : [];
  const previousLane =
    previousNodes.length > 0
      ? lane("previous", "previous", "vertical", "below", "offTopic", parentId, previousNodes, focusId)
      : null;
  if (previousLane) previousLane.extendSpine = true;
```

并把紧随其后的 `previousLane,`（对象字面量里的简写属性）改为：

```ts
    previousLane: null,
```

再把该对象下面这一行里对已删除局部变量的引用去掉：

```ts
  projection.expansionLanes = expansionLanes(graph, focusId, cardCodes([baseLane, branchLane, previousLane]));
```

改为：

```ts
  projection.expansionLanes = expansionLanes(graph, focusId, cardCodes([baseLane, branchLane]));
```

（原因：题外话焦点在 `projectFocus` 开头就由 `offTopicRoot` 分支接管，这里的 `relation === "offTopic"` 永远不成立，`previousLane` 恒为 `null`。）

- [ ] **Step 2: 删除布局 spec 与 compiler/router 的 extend**

Modify `src/layout/types.ts`：删除 `extend?: boolean;`（约 49 行，位于 spine/edge spec 上）。

Modify `src/layout/compiler.ts`：
1. 删除

```ts
      const extend = projection.hints.some(
        (hint) => hint.anchorId === projection.branchLane?.anchorId && hint.kind === "offTopic" && hint.extend
      );
```

2. 删除 spine 边里的

```ts
        extend,
```

3. 删除 hints 循环开头的

```ts
    const mergedIntoSpine =
      hint.kind === "offTopic" &&
      hint.extend === true &&
      projection.branchLane?.relation === "offTopic" &&
      projection.branchLane.anchorId === hint.anchorId;
    if (mergedIntoSpine) continue;
```

4. 删除 hint 边里的

```ts
      extend: hint.extend,
```

Modify `src/layout/router.ts`：删除 `routeSpine` 里这一行：

```ts
  if (spec.extend) endY += below ? LAYOUT_METRICS.verticalHintLength : -LAYOUT_METRICS.verticalHintLength;
```

并把上一行的 `let endY = ...` 改成 `const endY = ...`（删除后不再重新赋值）。

- [ ] **Step 3: 删除 marker 层的合并路径**

Modify `src/hidden-hint-markers.ts`：
1. `HiddenHintMarker` 接口里删除 `mergedIntoSpine: boolean;`
2. 删除 `mergedSpineEdge` 与 `isMergedIntoSpine` 两个函数
3. `collectHiddenHintMarkers` 循环体内

```ts
    const merged = isMergedIntoSpine(projection, hint);
    const edge = merged ? mergedSpineEdge(layout, hint) : hintEdge(layout, hint);
```

改为：

```ts
    const edge = hintEdge(layout, hint);
```

4. 删除 `mergedIntoSpine: merged,` 这一行
5. 更新函数注释，删除其中关于 extend 的那句：

```ts
/**
 * 将隐藏提示的语义锚点映射到真实路由端点。
 *
 * 每条提示对应 compiler 生成的 hint/fold 路由，从该路由的自由端取点。
 */
```

（注意：删除合并路径后，`collectHiddenHintMarkers(projection, layout)` 的第一个参数 `projection` 不再被函数体使用。**保留签名不变**——调用点在 `src/renderer.ts` 与 4 处测试里，为了一个已无语义的参数去改 5 个调用点不划算，且 `tsconfig` 未开启 `noUnusedParameters`。）

- [ ] **Step 4: 全量回归（必须仍全绿）**

```powershell
npm test
```

Expected：`Test Files  25 passed (25)` / `Tests  158 passed (158)`。本任务没有任何测试改动。

```powershell
git checkout -- preview-real.html
npx tsc --noEmit
```

Expected：`tsc` 无输出。

- [ ] **Step 5: 提交**

```powershell
git add src
git commit -m "refactor: 移除已不可达的主干延伸提示（extend）与合并主干路径"
```

---

### Task 4: 预览脚本递归取卡片文字，重生成预览页

仓库自带的开发预览脚本只在卡片的**直接子节点**里找文字，而 `renderLayout` 把 code 放在 `.zk-show-card-header` 内、title 放在 `.zk-show-card-body` 内，于是 `preview-math.html` / `preview-real.html` 里所有卡片都是没有文字的空框。这是独立的小修，与上面的规则无关。

**Files:**
- Modify: `scripts/gen-preview.mjs:108-110`、`scripts/gen-math-preview.mjs:129-131`、`scripts/gen-real-preview.mjs:130-132`
- 重新生成：`preview.html`、`preview-math.html`、`preview-real.html`

- [ ] **Step 1: 三个脚本各加一个递归查找函数**

在三个脚本里，找到 `function renderTree(el) {` 这一行，在它**上面**插入：

```js
function findByClass(el, cls) {
  for (const child of el.children ?? []) {
    if ((child.attrs?.["class"] || "").split(/\s+/).includes(cls)) return child;
    const nested = findByClass(child, cls);
    if (nested) return nested;
  }
  return undefined;
}
```

- [ ] **Step 2: 三个脚本各替换两行**

把

```js
    const title = el.children.find((c) => c.attrs["class"] === "zk-show-title");
    const code = el.children.find((c) => c.attrs["class"] === "zk-show-code");
```

替换为：

```js
    const title = findByClass(el, "zk-show-title");
    const code = findByClass(el, "zk-show-code");
```

- [ ] **Step 3: 重新生成预览并确认卡片有文字**

```powershell
node scripts/gen-math-preview.mjs
node scripts/gen-preview.mjs
node scripts/gen-real-preview.mjs
```

Expected：三个脚本正常结束并写出 `preview-math.html` / `preview.html` / `preview-real.html`。
若脚本内部还调用 `layoutView` 需要 esbuild，报 `spawn EPERM` 时按"执行环境注意"第 1 条放宽权限。

```powershell
foreach ($f in @("preview-math.html","preview.html","preview-real.html")) {
  $n = (Select-String -Path $f -Pattern 'class="zk-show-title"' -AllMatches).Matches.Count
  Write-Output "$f : zk-show-title 数量 = $n"
}
```

Expected：三个文件的 `zk-show-title` 数量都 **大于 0**（修改前 `preview-math.html` 与 `preview-real.html` 为 0）。同时用浏览器打开 `preview-math.html` 抽查，卡片应显示编码与标题。

- [ ] **Step 4: 提交**

```powershell
git add scripts preview.html preview-math.html preview-real.html
git commit -m "fix: 预览脚本递归读取卡片标题与编码，修复空卡预览"
```

---

### Task 5: 重建插件产物与最终验证

**Files:**
- 重新生成：`main.js`

- [ ] **Step 1: 构建**

```powershell
npm run build
git status --short
```

Expected：`main.js` 出现在改动列表里（它是仓库跟踪的插件产物，最近一次提交 `a0aa7cb` 同样更新了它）。

- [ ] **Step 2: 最终验证三连**

```powershell
npm test
```

Expected：`Test Files  25 passed (25)` / `Tests  158 passed (158)`。

```powershell
npx tsc --noEmit
```

Expected：无输出。

```powershell
git checkout -- preview-real.html
git status --short
```

Expected：只剩 `M main.js`（以及未跟踪的 `.tmp/`、`preview-offtopic-siblings.html`）。

- [ ] **Step 3: 人工核对验收标准**

在 Obsidian 里打开 `1/14`（真实库里 `1/14` 只有 `1/14a`，可用 `preview-offtopic-siblings.html` 的示意数据核对）确认：

- 查看题外话主行上的卡时，锚点下所有字母兄弟都出现；
- 兄弟卡的后续数字提示（卡右侧实线）与其自己的题外话提示（卡下方虚线）都在，且虚线垂直挂在卡片下方、不压到相邻卡；
- 查看主行上的数字继续卡（如 `1/14a1`）与查看起点卡（`1/14a`）看到的兄弟一致。

- [ ] **Step 4: 提交**

```powershell
git add main.js
git commit -m "build: 重建 main.js"
```

- [ ] **Step 5: 清理开发探针（可选）**

```powershell
Remove-Item -Recurse -Force .tmp
Remove-Item -Force preview-offtopic-siblings.html
```

（`.tmp/` 与 `preview-offtopic-siblings.html` 都是本计划的开发辅助物，未入库。若想保留对照页给人看，只删 `.tmp`。）
