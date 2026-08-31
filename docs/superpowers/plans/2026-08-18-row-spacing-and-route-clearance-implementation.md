# Row Spacing and Route Clearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every existing projection and ordering rule while guaranteeing readable adaptive spacing for cards, connection lines, and hint lines across lanes.

**Architecture:** Keep `TopicGraph`, `FocusProjection`, and `LayoutGraph` unchanged. Add reusable geometry predicates, strengthen the deterministic lane solver with minimum clearances, route cross-lane edges through obstacle-aware channels, and verify the final routed geometry before normalization.

**Tech Stack:** TypeScript 5.4, Vitest 1.6, SVG orthogonal lines/polylines, esbuild.

**Execution note:** The plugin directory is untracked inside a larger notes repository, and global worktree checkout was blocked by Windows path length plus an approval-service error. Execute inline in the current plugin directory, preserve unrelated files, and use test checkpoints instead of Git commits.

---

## File map

- Create `src/layout/clearance.ts`: rectangle/segment geometry, lane envelopes, and routed-layout conflict detection.
- Modify `src/layout/geometry.ts`: central minimum spacing and route-clearance metrics.
- Modify `src/layout/solver.ts`: clearance-aware deterministic lane placement.
- Modify `src/layout/router.ts`: obstacle-aware channel selection and polyline fallback.
- Modify `src/layout/types.ts`: conflict and geometry types shared by solver/router/tests.
- Create `test/layout-clearance.test.ts`: end-to-end geometry invariants over representative focus codes and long-title data.
- Modify `test/layout-solver.test.ts`: exact minimum gap assertions.
- Modify `test/layout-router.test.ts`: edge-to-foreign-card and cross-group route assertions.
- Modify `test/renderer.test.ts`: final normalized-layout invariants.

### Task 1: Lock the new geometry requirements with failing tests

**Files:**
- Create: `test/layout-clearance.test.ts`
- Modify: `test/layout-solver.test.ts`

- [ ] **Step 1: Add reusable test-side segment and rectangle checks**

Create tests that turn each routed line or polyline into axis-aligned segments and inflate every unrelated card by `LAYOUT_METRICS.edgeObstacleClearance`:

```ts
function segments(edge: RoutedEdge): Segment[] {
  const points = edge.points ?? [
    { x: edge.x1, y: edge.y1 },
    { x: edge.x2, y: edge.y2 },
  ];
  return points.slice(1).map((point, index) => ({
    x1: points[index].x,
    y1: points[index].y,
    x2: point.x,
    y2: point.y,
  }));
}

function unrelated(edge: RoutedEdge, node: PositionedNode): boolean {
  return node.id !== edge.sourceId && node.id !== edge.targetId;
}
```

- [ ] **Step 2: Add failing minimum-gap assertions**

Assert:

```ts
expect(LAYOUT_METRICS.horizontalGap).toBeGreaterThanOrEqual(40);
expect(LAYOUT_METRICS.verticalGap).toBeGreaterThanOrEqual(24);
expect(LAYOUT_METRICS.rowGap).toBeGreaterThanOrEqual(74);
expect(LAYOUT_METRICS.edgeObstacleClearance).toBe(16);
expect(LAYOUT_METRICS.routingChannelGap).toBe(16);
```

For each representative focus code, assert every segment avoids the inflated rectangle of every unrelated node. Use `1/11`, `1/12`, `1/11c`, `1/13`, `1/13a1`, `1/13a2`, and `1/131a12`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npx vitest run test/layout-solver.test.ts test/layout-clearance.test.ts
```

Expected: FAIL because the new metrics are absent or below the confirmed minimums, and any currently exposed route collision is reported with the focus code and involved IDs.

### Task 2: Add production geometry primitives and conflict reporting

**Files:**
- Create: `src/layout/clearance.ts`
- Modify: `src/layout/types.ts`
- Test: `test/layout-clearance.test.ts`

- [ ] **Step 1: Define geometry and conflict types**

Add to `src/layout/types.ts`:

```ts
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutConflict {
  kind: "node-node" | "edge-node" | "edge-edge" | "lane-lane";
  subjects: string[];
}
```

- [ ] **Step 2: Implement pure geometry helpers**

Create `src/layout/clearance.ts` with these exported functions:

```ts
export function inflateRect(rect: LayoutRect, padding: number): LayoutRect;
export function edgeSegments(edge: RoutedEdge): LayoutSegment[];
export function segmentIntersectsRect(segment: LayoutSegment, rect: LayoutRect): boolean;
export function segmentsConflict(first: LayoutSegment, second: LayoutSegment): boolean;
export function findLayoutConflicts(layout: RoutedLayout, clearance: number): LayoutConflict[];
```

Treat boundary contact with an inflated unrelated-card rectangle as a conflict. Ignore the source and target cards for their own edge. Permit shared geometry only when both edges have the same non-empty `groupId`.

- [ ] **Step 3: Replace duplicated test geometry with production helpers**

Import `edgeSegments`, `inflateRect`, and `segmentIntersectsRect` in `test/layout-clearance.test.ts`, then retain explicit assertions so a failure prints the focus code, edge group, and node ID.

- [ ] **Step 4: Run geometry tests**

Run:

```powershell
npx vitest run test/layout-clearance.test.ts
```

Expected: metric assertions remain RED; pure geometry unit cases PASS.

### Task 3: Enforce adaptive card and lane spacing

**Files:**
- Modify: `src/layout/geometry.ts`
- Modify: `src/layout/solver.ts`
- Modify: `test/layout-solver.test.ts`

- [ ] **Step 1: Centralize the confirmed metrics**

Set:

```ts
export const LAYOUT_METRICS = {
  cardHeight: 50,
  canvasPadding: 24,
  horizontalGap: 40,
  verticalGap: 24,
  rowGap: 74,
  branchIndent: 80,
  edgeChannelGap: 26,
  edgeObstacleClearance: 16,
  routingChannelGap: 16,
  hintLength: 50,
} as const;
```

- [ ] **Step 2: Solve collisions using clearance-aware rectangles**

In `src/layout/solver.ts`, replace the node-only `intersects` decision with a function that checks horizontal overlap and the required vertical separation for different horizontal lanes. Keep `branch` and `previous` as one movable group for off-topic history.

```ts
function lacksLaneClearance(a: PositionedNode, b: PositionedNode): boolean {
  const xOverlaps = a.x < b.x + b.width && a.x + a.width > b.x;
  if (!xOverlaps) return false;
  const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  return verticalGap < LAYOUT_METRICS.rowGap;
}
```

Exclude pairs that belong to the same semantic lane group. Move only the lower-priority lane group and calculate the shift from the exact missing clearance.

- [ ] **Step 3: Add solver regression cases**

Assert same-row gaps are at least 40px, vertical history gaps are at least 24px, and overlapping horizontal lane extents have at least 74px of vertical clearance.

- [ ] **Step 4: Run solver tests and verify GREEN**

Run:

```powershell
npx vitest run test/layout-solver.test.ts
```

Expected: all solver tests PASS with deterministic coordinates.

### Task 4: Route cross-lane edges through obstacle-aware channels

**Files:**
- Modify: `src/layout/router.ts`
- Modify: `test/layout-router.test.ts`
- Test: `test/layout-clearance.test.ts`

- [ ] **Step 1: Add deterministic channel candidates**

For a source/target set, generate candidate x coordinates in this order:

```ts
const candidates = [
  centerX(source),
  source.x - LAYOUT_METRICS.edgeObstacleClearance,
  source.x + source.width + LAYOUT_METRICS.edgeObstacleClearance,
  ...obstacles.flatMap((node) => [
    node.x - LAYOUT_METRICS.edgeObstacleClearance,
    node.x + node.width + LAYOUT_METRICS.edgeObstacleClearance,
  ]),
];
```

Deduplicate and sort by distance from the current semantic spine, then by numeric coordinate.

- [ ] **Step 2: Select the first clear orthogonal path**

For `orthogonal` and `spine` edges, test the vertical channel plus every horizontal ingress segment against unrelated inflated nodes and already reserved segments. Preserve the current direct route when it is clear. When it is blocked, emit a `poly` route containing the source exit, channel bends, and target ingress.

- [ ] **Step 3: Reserve relation-group routes**

Track routed segments by `groupId`. Geometry reuse is allowed inside the same shared-spine group. Other groups select the next clear candidate separated by `routingChannelGap`.

- [ ] **Step 4: Keep hints inside reserved lane space**

Route above/below hints with length 50px. Because `rowGap` is 74px and obstacle clearance is 16px, the hint retains at least 8px additional slack before the next row envelope. Trailing and fold-left hints use obstacle checks; when a direct hint is blocked, route it toward the nearest free outer channel while preserving its placement direction.

- [ ] **Step 5: Run router and clearance tests**

Run:

```powershell
npx vitest run test/layout-router.test.ts test/layout-clearance.test.ts
```

Expected: existing shared-spine and fold semantics PASS; all unrelated edge/card checks PASS.

### Task 5: Verify final normalized layouts and fallback behavior

**Files:**
- Modify: `src/renderer.ts`
- Modify: `test/renderer.test.ts`
- Test: `test/layout-normalize.test.ts`

- [ ] **Step 1: Validate routed geometry before normalization**

Call `findLayoutConflicts` after routing. If conflicts remain, invoke a deterministic fallback router that assigns each cross-lane relation group an outer x channel beyond the rightmost card, separated by `routingChannelGap`, then validate again.

```ts
const routed = routeEdges(solved);
const safe = findLayoutConflicts(routed, LAYOUT_METRICS.edgeObstacleClearance).length === 0
  ? routed
  : routeEdges(solved, { forceOuterChannels: true });
const normalized = normalizeLayout(safe);
```

The fallback preserves node coordinates, lane order, relation styles, and shared group IDs; only edge paths change.

- [ ] **Step 2: Add final-layout invariants**

Extend `test/renderer.test.ts` to assert card gaps, unrelated edge/card clearance, stable output from repeated calls, and every polyline point within the final canvas.

- [ ] **Step 3: Run the complete suite**

Run:

```powershell
npm test
```

Expected: all test files PASS with zero failures.

- [ ] **Step 4: Run type and production checks**

Run:

```powershell
npx tsc --noEmit
npm run build
```

Expected: the layout files introduce no new type errors; production build completes. If the previously observed `src/main.ts` EventTarget-to-Element error remains unchanged, record it separately as pre-existing evidence.

- [ ] **Step 5: Inspect representative output data**

Run the existing math analysis fixture and inspect `1/12`, `1/11c`, `1/13a1`, and a deep mixed branch. Confirm node order, solid/dashed styles, shared-spine count, canvas bounds, and zero reported geometry conflicts.

## Completion checklist

- [ ] All existing semantic tests pass.
- [ ] New spacing and clearance tests pass.
- [ ] No routed segment intersects an unrelated card safety rectangle.
- [ ] Cross-group routes avoid accidental overlap.
- [ ] Identical input yields identical coordinates and routes.
- [ ] Production build succeeds.
- [ ] Changed files are limited to the layout pipeline, tests, and implementation documents.
