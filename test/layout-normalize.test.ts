import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { normalizeLayout } from "../src/layout/normalize";
import { routeEdges } from "../src/layout/router";
import { solveLayout } from "../src/layout/solver";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const graph = new TopicGraph(MATH_TOPIC_RECORDS);

function normalized(code: string) {
  return normalizeLayout(routeEdges(solveLayout(compileLayoutGraph(projectFocus(graph, code)!))));
}

describe("normalizeLayout", () => {
  it("将所有卡片、线段端点和折线点平移到画布范围内", () => {
    for (const code of ["1", "1/11", "1/12", "1/11c", "1/11a2", "1/131a12"]) {
      const layout = normalized(code);
      for (const node of layout.nodes) {
        expect(node.x, `${code}:${node.id}:x`).toBeGreaterThanOrEqual(LAYOUT_METRICS.canvasPadding);
        expect(node.y, `${code}:${node.id}:y`).toBeGreaterThanOrEqual(LAYOUT_METRICS.canvasPadding);
        expect(node.x + node.width, `${code}:${node.id}:right`).toBeLessThanOrEqual(layout.width - LAYOUT_METRICS.canvasPadding);
        expect(node.y + node.height, `${code}:${node.id}:bottom`).toBeLessThanOrEqual(layout.height - LAYOUT_METRICS.canvasPadding);
      }
      for (const edge of layout.edges) {
        const points = edge.points ?? [
          { x: edge.x1, y: edge.y1 },
          { x: edge.x2, y: edge.y2 },
        ];
        for (const point of points) {
          expect(point.x, `${code}:edge-x`).toBeGreaterThanOrEqual(LAYOUT_METRICS.canvasPadding);
          expect(point.y, `${code}:edge-y`).toBeGreaterThanOrEqual(LAYOUT_METRICS.canvasPadding);
          expect(point.x, `${code}:edge-right`).toBeLessThanOrEqual(layout.width - LAYOUT_METRICS.canvasPadding);
          expect(point.y, `${code}:edge-bottom`).toBeLessThanOrEqual(layout.height - LAYOUT_METRICS.canvasPadding);
        }
      }
    }
  });

  it("输出正尺寸画布并保持相对几何关系", () => {
    const layout = normalized("1/12");
    const current = layout.nodes.find((node) => node.id === "1/12")!;
    const parent = layout.nodes.find((node) => node.id === "1/1")!;

    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(current.y).toBeLessThan(parent.y);
  });
});
