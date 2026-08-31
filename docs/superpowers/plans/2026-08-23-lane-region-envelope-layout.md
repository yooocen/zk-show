# 通用泳道区域包围盒布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current horizontal-overlap-only lane spacing with deterministic semantic lane-region envelopes so source, continuation, branch, and expansion rows never occupy the same vertical band.

**Architecture:** Keep `TopicGraph → FocusProjection → LayoutGraph` and the initial node placement unchanged. Add a pure region helper that groups semantically shared lanes, derives deterministic region order from lane direction and anchor ancestry, and shifts complete regions by the minimum amount needed to satisfy `rowGap`; keep the existing local collision pass and router as the final geometry guards.

**Tech Stack:** TypeScript 5.4, Vitest 1.6, SVG orthogonal routing, esbuild.

**Execution note:** The plugin directory is untracked inside a larger notes repository, so execute inline in the current directory and use test/build checkpoints instead of commits. Preserve unrelated generated previews and existing user changes.

---

## File map

- Create `src/layout/regions.ts`: pure lane-region grouping, semantic ordering, envelope calculation, and minimum vertical separation.
- Modify `src/layout/solver.ts`: call the region solver after initial placement, remove `placeSourceBelowBranchExpansions`, and retain only local collision handling that is not already covered by region separation.
- Modify `test/layout-solver.test.ts`: add the failing `1/131a1` regression and region-order assertions for both directions and grouped off-topic history.
- Modify `test/layout-clearance.test.ts`: assert routed geometry remains conflict-free after region shifts.
- Modify `test/analyze-math.test.ts`: assert the real mathematical fixture has the requested vertical order and no foreign-card line crossings.
- Create `docs/superpowers/plans/2026-08-23-lane-region-envelope-layout.md`: this implementation plan.

## Invariants to preserve

- `horizontalGap >= 40`, `verticalGap >= 24`, and semantic region gap `rowGap >= 74`.
- Horizontal lane order and node order are unchanged.
- An off-topic `previous` lane and its `branch` lane move as one group and keep their internal `verticalGap` spacing.
- Above/below relation direction remains true relative to the anchor card.
- The same input returns byte-for-byte equal node coordinates.
- Routing is re-evaluated against the shifted nodes; no unrelated card safety rectangle is crossed.

### Task 1: Add the failing semantic-region regression

**Files:**
- Modify: `test/layout-solver.test.ts`

- [ ] **Step 1: Add helpers and a failing test for the reported view**

Add these helpers beside the existing `solve` helper:

```ts
function node(solved: ReturnType<typeof solve>, id: string): PositionedNode {
  const result = solved.nodes.find((item) => item.id === id);
  if (!result) throw new Error(`missing node ${id}`);
  return result;
}

function verticalGap(first: PositionedNode, second: PositionedNode): number {
  return Math.max(first.y, second.y) - Math.min(first.y + first.height, second.y + second.height);
}
```

Add this test to `describe("solveLayout", ...)`:

```ts
it("按语义区域把来源行放在继续讨论行上方", () => {
  const solved = solve("1/131a1");
  const source = node(solved, "1/131");
  const continuation = [node(solved, "1/131a11"), node(solved, "1/131a12")];
  const current = [node(solved, "1/131a"), node(solved, "1/131a1")];

  expect(Math.max(...continuation.map((item) => item.y))).toBeGreaterThan(source.y);
  expect(Math.min(...continuation.map((item) => item.y))).toBeGreaterThanOrEqual(
    source.y + source.height + LAYOUT_METRICS.rowGap
  );
  expect(Math.min(...current.map((item) => item.y))).toBeGreaterThanOrEqual(
    Math.max(...continuation.map((item) => item.y + item.height)) + LAYOUT_METRICS.rowGap
  );
  expect(verticalGap(source, continuation[0])).toBeGreaterThanOrEqual(LAYOUT_METRICS.rowGap);
});
```

- [ ] **Step 2: Run only the new test and verify RED**

Run:

```powershell
npm.cmd test -- --run test/layout-solver.test.ts -t "按语义区域把来源行放在继续讨论行上方"
```

Expected: FAIL because the current solver leaves the source and continuation rows in the same vertical band when their x ranges do not overlap.

- [ ] **Step 3: Add the mirror and grouping assertions while still RED**

Add these tests:

```ts
it("镜像场景按上方讨论、下展开、来源的顺序排列", () => {
  const solved = solve("1/11");
  const branch = node(solved, "1/11");
  const expansion = node(solved, "1/11a");
  const source = node(solved, "1/1");

  expect(expansion.y).toBeGreaterThan(branch.y + branch.height);
  expect(source.y).toBeGreaterThanOrEqual(expansion.y + expansion.height + LAYOUT_METRICS.rowGap);
});

it("题外历史 previous 与 branch 仍是同一区域", () => {
  const solved = solve("1/11c");
  const previous = node(solved, "1/11b");
  const current = node(solved, "1/11c");
  expect(current.x).toBe(previous.x);
  expect(current.y - (previous.y + previous.height)).toBeGreaterThanOrEqual(LAYOUT_METRICS.verticalGap);
  expect(current.y - (previous.y + previous.height)).toBeLessThan(LAYOUT_METRICS.rowGap);
});
```

- [ ] **Step 4: Run the solver file and record the expected RED cases**

Run:

```powershell
npm.cmd test -- --run test/layout-solver.test.ts
```

Expected: the new `1/131a1` test fails; existing tests remain green or expose only the mirror expectation that the implementation must preserve. Do not change production code before this failure is observed.

### Task 2: Implement pure lane-region modeling

**Files:**
- Create: `src/layout/regions.ts`
- Modify: `src/layout/types.ts` only if a shared exported type is needed by tests; keep the first implementation internal to `regions.ts` when possible.
- Test: `test/layout-solver.test.ts`

- [ ] **Step 1: Define the region interfaces and grouping function**

Create this focused API:

```ts
import { LAYOUT_METRICS } from "./geometry";
import type { LayoutGraph, LayoutLane, LayoutNode } from "./types";

export interface LaneRegion {
  id: string;
  laneIds: string[];
  parentId: string | null;
  direction: "above" | "below" | "same";
  order: number;
}

export interface LaneEnvelope {
  regionId: string;
  top: number;
  bottom: number;
}

export interface RegionPoint {
  x: number;
  y: number;
}

export function buildLaneRegions(graph: LayoutGraph): LaneRegion[];
export function orderLaneRegions(
  graph: LayoutGraph,
  regions: LaneRegion[],
  positions: Map<string, RegionPoint>
): string[];
export function enforceRegionClearance(
  graph: LayoutGraph,
  regions: LaneRegion[],
  positions: Map<string, RegionPoint>
): void;
```

`buildLaneRegions` must merge exactly `previous` and `branch` when `branch.relation === "offTopic"`; all other lanes start as one region. Determine a region's parent from its anchor node's lane, then map that lane through the merge table. Missing anchors become root regions in lane order.

- [ ] **Step 2: Implement deterministic region ordering**

Use a DFS with fixed ordering, not object/map iteration order:

```ts
function visit(regionId: string, direction: "above" | "below" | "same", seen: Set<string>, out: string[]): void {
  if (seen.has(regionId)) return;
  seen.add(regionId);
  const children = childrenByParent.get(regionId) ?? [];
  for (const child of children.filter((item) => item.direction === "above")) visit(child.id, "above", seen, out);
  out.push(regionId);
  for (const child of children.filter((item) => item.direction !== "above")) visit(child.id, child.direction, seen, out);
}
```

Sort children by initial envelope top, then `order`, then `id`. On a cycle, mark the revisited edge as skipped and append unvisited regions in `order` order so malformed graphs terminate deterministically.

- [ ] **Step 3: Implement envelope calculation and minimum movement**

For each region, compute `top` and `bottom` from every node in its member lanes. Add `verticalHintLength` above or below the member node when the graph has a hint edge with `placement === "above"` or `"below"`; ignore `trailing` and `fold-left` for vertical bounds. Then scan the ordered regions and move all member lanes by the exact deficit:

```ts
const requiredTop = previous.bottom + LAYOUT_METRICS.rowGap;
const shift = Math.max(0, requiredTop - current.top);
if (shift > 0) moveLanes(graph, positions, currentRegion.laneIds, 0, shift);
```

Recompute the moved region's envelope before processing the next region. Never move a member lane independently of its region.

- [ ] **Step 4: Add pure-helper assertions through the solver tests**

Assert that the `1/11c` previous/branch cards stay within one compact grouped region while `1/131a1` source/continuation/current cards satisfy the two `rowGap` gaps. Run:

```powershell
npm.cmd test -- --run test/layout-solver.test.ts
```

Expected: the new tests are still RED until the solver calls `enforceRegionClearance`.

### Task 3: Replace the solver exception with the region pass

**Files:**
- Modify: `src/layout/solver.ts`
- Test: `test/layout-solver.test.ts`

- [ ] **Step 1: Import and call the region pass**

Add:

```ts
import { buildLaneRegions, enforceRegionClearance } from "./regions";
```

Replace:

```ts
placeSourceBelowBranchExpansions(graph, positions);
resolveCollisions(graph, positions);
```

with:

```ts
const regions = buildLaneRegions(graph);
enforceRegionClearance(graph, regions, positions);
resolveCollisions(graph, positions);
```

Delete `placeSourceBelowBranchExpansions` and its now-unused helper code. Keep `resolveCollisions` for true card collisions and horizontal/vertical adjustments that are not semantic region ordering.

- [ ] **Step 2: Ensure the collision pass does not undo region ordering**

Keep the existing `laneGroup` behavior for `previous + branch`. When a conflict is found between two distinct regions, move the lower region through the region API rather than an individual lane; when a conflict is within a grouped region, retain the existing orientation-specific local movement. The final node map must still include every graph node with a position.

- [ ] **Step 3: Run the focused solver tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --run test/layout-solver.test.ts
```

Expected: all solver tests PASS, including `1/131a1`, the mirror case, grouped history, no-card-overlap cases, and deterministic-coordinate checks.

### Task 4: Re-route and validate the shifted geometry

**Files:**
- Modify: `test/layout-clearance.test.ts`
- Modify: `test/analyze-math.test.ts`
- Modify: `test/layout-router.test.ts` only if a route assertion needs the actual new channel coordinate; do not change router behavior unless a test demonstrates a new conflict.

- [ ] **Step 1: Add routed regression coverage for the reported view**

In `test/layout-clearance.test.ts`, include `"1/131a1"` and `"1/131a12"` in the representative route list. Assert:

```ts
expect(findLayoutConflicts(route("1/131a1"))).toEqual([]);
```

Also assert every edge segment avoids every unrelated card's inflated rectangle using the existing `edgeSegments`, `inflateRect`, and `segmentIntersectsRect` helpers.

- [ ] **Step 2: Add real-fixture ordering coverage**

In `test/analyze-math.test.ts`, add:

```ts
it("1/131a1 来源行高于继续讨论行，继续讨论行又高于当前行", () => {
  const result = layout("1/131a1");
  const source = result.cards.find((card) => card.code === "1/131")!;
  const continuation = result.cards.filter((card) => ["1/131a11", "1/131a12"].includes(card.code));
  const current = result.cards.filter((card) => ["1/131a", "1/131a1"].includes(card.code));
  expect(Math.min(...continuation.map((card) => card.y))).toBeGreaterThanOrEqual(source.y + source.h + 74);
  expect(Math.min(...current.map((card) => card.y))).toBeGreaterThanOrEqual(
    Math.max(...continuation.map((card) => card.y + card.h)) + 74
  );
});
```

- [ ] **Step 3: Run focused router/renderer tests**

Run:

```powershell
npm.cmd test -- --run test/layout-clearance.test.ts test/layout-router.test.ts test/analyze-math.test.ts
```

Expected: PASS with no unresolved `findLayoutConflicts` entries and no edge segment crossing an unrelated card.

If this fails, change only the route candidate selection in `src/layout/router.ts` after recording the exact conflict; preserve edge IDs, styles, shared group IDs, and node coordinates.

### Task 5: Full verification and handoff

**Files:**
- Modify: none unless a verified failure from Tasks 3–4 requires the narrowly scoped fix described there.

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm.cmd test
```

Expected: every Vitest file passes with no unhandled errors.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected: esbuild completes successfully and regenerates `main.js` without TypeScript errors.

- [ ] **Step 3: Regenerate the math preview for visual verification**

Run:

```powershell
node scripts/gen-math-preview.mjs
```

Inspect `preview-math.html` for `1/131a1` and confirm the source row is visibly above the continuation row, with the current row below both. Confirm the existing `1/11` mirror view still has its expansion between the upper branch and source row.

- [ ] **Step 4: Perform final diff and transcript verification**

Run:

```powershell
git -C "C:\Users\cc\7adiu-d2vq6" -c safe.directory="C:/Users/cc/7adiu-d2vq6" diff -- "技术和学习记录/.obsidian/plugins/zk-show/src/layout" "技术和学习记录/.obsidian/plugins/zk-show/test"
Get-Content -LiteralPath "C:\Users\cc\7adiu-d2vq6\技术和学习记录\agents\L0\zk-show\2026-08-23_13-02-05_29f54b4f-c095-4cde-87ee-481799874014.md" -Raw
```

Check that only the planned layout/test files and expected build output changed, no credentials or unrelated files were added, and the final transcript append is the last file operation before reporting completion.
