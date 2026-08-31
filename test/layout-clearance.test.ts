import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { routeEdges } from "../src/layout/router";
import { solveLayout } from "../src/layout/solver";
import type { PositionedNode } from "../src/layout/types";
import { edgeSegments, findLayoutConflicts, inflateRect, segmentIntersectsRect } from "../src/layout/clearance";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const graph = new TopicGraph(MATH_TOPIC_RECORDS);

function route(code: string) {
  const projection = projectFocus(graph, code)!;
  return routeEdges(solveLayout(compileLayoutGraph(projection)));
}

function overlap(a: PositionedNode, b: PositionedNode): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("layout clearance invariants", () => {
  it("uses the confirmed adaptive spacing floor", () => {
    expect(LAYOUT_METRICS.horizontalGap).toBeGreaterThanOrEqual(40);
    expect(LAYOUT_METRICS.verticalGap).toBeGreaterThanOrEqual(24);
    expect(LAYOUT_METRICS.rowGap).toBeGreaterThanOrEqual(74);
    expect(LAYOUT_METRICS.edgeObstacleClearance).toBe(16);
    expect(LAYOUT_METRICS.routingChannelGap).toBe(16);
    expect(LAYOUT_METRICS.verticalHintLength).toBe(25);
    expect(LAYOUT_METRICS.verticalHintLength).toBeLessThan(LAYOUT_METRICS.rowGap / 2);
  });

  it("keeps all visible card rectangles separate", () => {
    for (const code of ["1/11", "1/12", "1/11c", "1/13", "1/13a1", "1/131a1", "1/131a12"]) {
      const routed = route(code);
      for (let i = 0; i < routed.nodes.length; i++) {
        for (let j = i + 1; j < routed.nodes.length; j++) {
          expect(overlap(routed.nodes[i], routed.nodes[j]), `${code}: card overlap`).toBe(false);
        }
      }
    }
  });

  it("keeps routed lines away from unrelated card safety rectangles", () => {
    for (const code of ["1/11", "1/12", "1/11c", "1/13", "1/13a1", "1/131a1", "1/131a12"]) {
      const routed = route(code);
      for (const edge of routed.edges) {
        for (const segment of edgeSegments(edge)) {
          for (const node of routed.nodes) {
            if (node.id === edge.sourceId || node.id === edge.targetId) continue;
            const obstacle = inflateRect(node, LAYOUT_METRICS.edgeObstacleClearance);
            expect(
              segmentIntersectsRect(segment, obstacle),
              `${code}: ${edge.groupId ?? edge.sourceId ?? "edge"} crosses ${node.id}`
            ).toBe(false);
          }
        }
      }
    }
  });

  it("reports no unresolved routed geometry conflicts", () => {
    for (const code of ["1/11", "1/12", "1/11c", "1/13", "1/13a1", "1/131a1", "1/131a12"]) {
      const routed = route(code);
      expect(findLayoutConflicts(routed), code).toEqual([]);
    }
  });
});
